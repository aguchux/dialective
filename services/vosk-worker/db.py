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
    "rejectionReason" = %(rejection_reason)s,
    "updatedAt" = now()
WHERE id = %(submission_id)s
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
    rejection_reason: str | None = None,
) -> None:
    """
    Updates the Submission row api's POST /submissions/create already
    inserted (status PENDING) before publishing to asr-jobs-*. This UPDATE
    only matches a row if that insert already happened -- if it hasn't
    (an ordering bug, or a stale/replayed message), this is a silent no-op
    (0 rows matched), not an error; log it so it's visible without crashing
    the worker loop.
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
                "rejection_reason": rejection_reason,
            },
        )
        if cur.rowcount == 0:
            logger.warning(
                "update_submission_result matched 0 rows for submission=%s -- "
                "was the Submission row inserted before this job was published?",
                submission_id,
            )
    conn.commit()
