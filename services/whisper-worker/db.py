import json
import logging
import os

import psycopg2

logger = logging.getLogger(__name__)

# Data-layer-only access against tables api's Prisma migrations own -- this
# worker never runs DDL/migrations of its own. See AGENTS.md "Database
# access": api is the sole schema owner; Python can't consume the shared TS
# Prisma client (@dialectiva/db), so a direct read/write connection against
# api-owned tables is the closest equivalent available here.
UPDATE_SUBMISSION_SQL = """
UPDATE submissions
SET status = %(status)s,
    transcript = %(transcript)s,
    "asrConfidence" = %(asr_confidence)s,
    "asrEngine" = %(asr_engine)s,
    "asrWordDetail" = %(asr_word_detail)s,
    "rejectionReason" = %(rejection_reason)s,
    "updatedAt" = now()
WHERE id = %(submission_id)s AND status = 'PENDING'
"""


def build_db_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def mean_confidence(word_confidences: list) -> float | None:
    if not word_confidences:
        return None
    return sum(w["conf"] for w in word_confidences) / len(word_confidences)


def update_submission_result(
    conn,
    submission_id: str,
    *,
    status: str,
    transcript: str | None = None,
    asr_confidence: float | None = None,
    asr_engine: str | None = None,
    asr_word_detail: list | None = None,
    rejection_reason: str | None = None,
) -> None:
    """
    Updates the Submission row api's POST /submissions/create already
    inserted (status PENDING) before publishing to asr-jobs-*. The WHERE
    clause requires status = 'PENDING' so this is a no-op once
    settlement-job's timeout resolver has already claimed the row (moved it
    to EXPIRED/SETTLED) -- ASR must never resurrect/overwrite a row settlement
    already paid out or refunded, even if this job was queued/running before
    the timeout fired. 0 rows matched is therefore either that race (expected,
    not an error) or a genuine ordering bug (row never inserted); either way
    it's a silent no-op, just logged for visibility.
    """
    with conn.cursor() as cur:
        cur.execute(
            UPDATE_SUBMISSION_SQL,
            {
                "submission_id": submission_id,
                "status": status,
                "transcript": transcript,
                "asr_confidence": asr_confidence,
                "asr_engine": asr_engine,
                "asr_word_detail": json.dumps(asr_word_detail) if asr_word_detail is not None else None,
                "rejection_reason": rejection_reason,
            },
        )
        if cur.rowcount == 0:
            logger.warning(
                "update_submission_result matched 0 rows for submission=%s -- "
                "already claimed by settlement-job's timeout resolver, or the "
                "row was never inserted before this job was published?",
                submission_id,
            )
    conn.commit()
