import json
import logging
import os
import time

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

# Mirrors UPDATE_SUBMISSION_SCORES_SQL's "updatedAt"/word_recordings asymmetry
# above -- Submission sets "updatedAt", WordRecording doesn't, matching the
# existing (pre-existing, not introduced by this feature) inconsistency
# between the two score-write SQL constants.
UPDATE_SUBMISSION_EXPRESSION_SQL = """
UPDATE submissions
SET emotion = %(emotion)s,
    "emotionConfidence" = %(emotion_confidence)s,
    tone = %(tone)s,
    style = %(style)s,
    speed = %(speed)s,
    energy = %(energy)s,
    "prosodyMetrics" = %(prosody_metrics)s,
    "expressionCheckedAt" = now(),
    "updatedAt" = now()
WHERE id = %(record_id)s
"""

UPDATE_WORD_RECORDING_EXPRESSION_SQL = """
UPDATE word_recordings
SET emotion = %(emotion)s,
    "emotionConfidence" = %(emotion_confidence)s,
    tone = %(tone)s,
    style = %(style)s,
    speed = %(speed)s,
    energy = %(energy)s,
    "prosodyMetrics" = %(prosody_metrics)s,
    "expressionCheckedAt" = now()
WHERE id = %(record_id)s
"""

_speech_expression_enabled_cache: tuple[bool, float] | None = None
SPEECH_EXPRESSION_ENABLED_CACHE_TTL_S = (
    5.0  # mirrors PlatformSettingsService's own 5s in-process cache TTL
)


def build_db_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def write_scores(
    conn,
    record_kind: str,
    record_id: str,
    *,
    noise_score: float,
    quality_score: float,
    liveness_score: float,
) -> None:
    """
    Writes the three quality-gate signals onto the Submission or
    WordRecording row api already inserted before publishing to
    quality-gate-jobs. A 0-row match is a silent no-op (logged, not
    raised) -- same tolerance as vosk-worker's update_submission_result,
    since this worker never creates rows, only annotates ones api already
    created.
    """
    sql = (
        UPDATE_SUBMISSION_SCORES_SQL
        if record_kind == "submission"
        else UPDATE_WORD_RECORDING_SCORES_SQL
    )
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


def write_expression(
    conn,
    record_kind: str,
    record_id: str,
    *,
    emotion: str | None,
    emotion_confidence: float | None,
    tone: str | None,
    style: str | None,
    speed: str | None,
    energy: str | None,
    prosody_metrics: dict | None,
) -> None:
    """
    Writes speech-expression analysis output onto the Submission or
    WordRecording row -- only called when PlatformSettings.
    speechExpressionEnabled is on (see get_speech_expression_enabled).
    Same 0-row-match tolerance as write_scores (logged, not raised).
    """
    sql = (
        UPDATE_SUBMISSION_EXPRESSION_SQL
        if record_kind == "submission"
        else UPDATE_WORD_RECORDING_EXPRESSION_SQL
    )
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "record_id": record_id,
                "emotion": emotion,
                "emotion_confidence": emotion_confidence,
                "tone": tone,
                "style": style,
                "speed": speed,
                "energy": energy,
                "prosody_metrics": json.dumps(prosody_metrics)
                if prosody_metrics is not None
                else None,
            },
        )
        if cur.rowcount == 0:
            logger.warning(
                "write_expression matched 0 rows for %s=%s -- was the row inserted before this job was published?",
                record_kind,
                record_id,
            )
    conn.commit()


def get_speech_expression_enabled(conn) -> bool:
    """
    Reads PlatformSettings.speechExpressionEnabled directly -- the first
    Python worker read of platform config (every other Python-worker/db.py
    function only ever writes). Cached for SPEECH_EXPRESSION_ENABLED_CACHE_TTL_S
    per worker process to avoid a DB round-trip on every job when the flag
    rarely changes, mirroring PlatformSettingsService's own 5s in-process
    cache -- checked per job (not just at pod startup) so an admin toggling
    it in the admin settings UI takes effect without a worker restart,
    bounded by this cache's TTL.
    """
    global _speech_expression_enabled_cache
    now = time.monotonic()
    if _speech_expression_enabled_cache is not None:
        cached_value, cached_at = _speech_expression_enabled_cache
        if now - cached_at < SPEECH_EXPRESSION_ENABLED_CACHE_TTL_S:
            return cached_value

    with conn.cursor() as cur:
        cur.execute('SELECT "speechExpressionEnabled" FROM platform_settings LIMIT 1')
        row = cur.fetchone()
    value = bool(row[0]) if row else False
    _speech_expression_enabled_cache = (value, now)
    return value


def reject_submission(conn, submission_id: str, rejection_reason: str) -> None:
    """
    Same REJECTED-write shape as vosk-worker's prefilter rejection --
    settlement-job's existing refundRejectedSubmissions() sweep picks this
    up unmodified. Word recordings have no equivalent reject path (no
    prefilter exists for that flow today), so this only ever applies to
    Submissions.
    """
    with conn.cursor() as cur:
        cur.execute(
            REJECT_SUBMISSION_SQL,
            {"record_id": submission_id, "rejection_reason": rejection_reason},
        )
        if cur.rowcount == 0:
            logger.warning(
                "reject_submission matched 0 rows for submission=%s", submission_id
            )
    conn.commit()
