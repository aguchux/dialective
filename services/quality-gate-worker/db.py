import logging
import os

import psycopg2

logger = logging.getLogger(__name__)

# Data-layer-only access against tables api's Prisma migrations own -- this
# worker never runs DDL/migrations of its own. See AGENTS.md "Database
# access": api is the sole schema owner; Python can't consume the shared TS
# Prisma client (@dialectiva/db), so a direct read/write connection against
# api-owned tables is the closest equivalent available here. Mirrors
# services/vosk-worker/db.py's shape.

UPDATE_SUBMISSION_SCORES_SQL = """
UPDATE submissions
SET "noiseScore" = %(noise_score)s,
    "qualityScore" = %(quality_score)s,
    "livenessScore" = %(liveness_score)s,
    "qualityGateCheckedAt" = now(),
    "updatedAt" = now()
WHERE id = %(record_id)s
"""

REJECT_SUBMISSION_SQL = """
UPDATE submissions
SET status = 'REJECTED',
    "rejectionReason" = %(rejection_reason)s,
    "qualityGateCheckedAt" = now(),
    "updatedAt" = now()
WHERE id = %(record_id)s
"""

UPDATE_WORD_RECORDING_SCORES_SQL = """
UPDATE word_recordings
SET "noiseScore" = %(noise_score)s,
    "qualityScore" = %(quality_score)s,
    "livenessScore" = %(liveness_score)s,
    "qualityGateCheckedAt" = now()
WHERE id = %(record_id)s
"""


def build_db_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def write_scores(conn, record_kind: str, record_id: str, *, noise_score: float, quality_score: float, liveness_score: float) -> None:
    """
    Writes the three quality-gate signals onto the Submission or
    WordRecording row api already inserted before publishing to
    quality-gate-jobs. A 0-row match is a silent no-op (logged, not
    raised) -- same tolerance as vosk-worker's update_submission_result,
    since this worker never creates rows, only annotates ones api already
    created.
    """
    sql = UPDATE_SUBMISSION_SCORES_SQL if record_kind == "submission" else UPDATE_WORD_RECORDING_SCORES_SQL
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "record_id": record_id,
                "noise_score": noise_score,
                "quality_score": quality_score,
                "liveness_score": liveness_score,
            },
        )
        if cur.rowcount == 0:
            logger.warning(
                "write_scores matched 0 rows for %s=%s -- was the row inserted before this job was published?",
                record_kind,
                record_id,
            )
    conn.commit()


def reject_submission(conn, submission_id: str, rejection_reason: str) -> None:
    """
    Same REJECTED-write shape as vosk-worker's prefilter rejection --
    settlement-job's existing refundRejectedSubmissions() sweep picks this
    up unmodified. Word recordings have no equivalent reject path (no
    prefilter exists for that flow today), so this only ever applies to
    Submissions.
    """
    with conn.cursor() as cur:
        cur.execute(REJECT_SUBMISSION_SQL, {"record_id": submission_id, "rejection_reason": rejection_reason})
        if cur.rowcount == 0:
            logger.warning("reject_submission matched 0 rows for submission=%s", submission_id)
    conn.commit()
