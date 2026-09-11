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

REJECT_WORD_RECORDING_SQL = """
UPDATE word_recordings
SET status = 'REJECTED',
    "rejectionReason" = %(rejection_reason)s,
    "qualityGateCheckedAt" = now()
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

# Unlike word_recordings (already status='SCORED' at creation -- see
# WordsService.createRecording, which computes an exact-match score
# synchronously and never depends on this worker to reach SCORED),
# domain_conversation_recordings have no synchronous score at creation
# (no exact-match concept for a free-form conversation) and are created
# PENDING. This worker's score-write IS what moves them to SCORED --
# settlement-job's settleDomainConversationRecordings() sweep only ever
# looks at status='SCORED' rows, so without this transition here a
# submission would sit PENDING forever and eventually get refunded by the
# stuck-timeout sweep instead of ever settling.
UPDATE_DOMAIN_CONVERSATION_RECORDING_SCORES_SQL = """
UPDATE domain_conversation_recordings
SET "noiseScore" = %(noise_score)s,
    "qualityScore" = %(quality_score)s,
    "livenessScore" = %(liveness_score)s,
    "qualityGateCheckedAt" = now(),
    status = 'SCORED',
    "scoredAt" = now()
WHERE id = %(record_id)s
"""

REJECT_DOMAIN_CONVERSATION_RECORDING_SQL = """
UPDATE domain_conversation_recordings
SET status = 'REJECTED',
    "rejectionReason" = %(rejection_reason)s,
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
    if record_kind == "submission":
        sql = UPDATE_SUBMISSION_SCORES_SQL
    elif record_kind == "domain_conversation_recording":
        sql = UPDATE_DOMAIN_CONVERSATION_RECORDING_SCORES_SQL
    else:
        sql = UPDATE_WORD_RECORDING_SCORES_SQL
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
    up unmodified.
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


def reject_word_recording(conn, word_recording_id: str, rejection_reason: str) -> None:
    """
    Mirrors reject_submission -- settlement-job's refundRejectedWordRecordings()
    sweep picks this up the same way refundRejectedSubmissions() already does
    for Submission. This worker never touches Wallet/LedgerEntry/audio
    deletion directly (same "dumb status flip" posture as reject_submission);
    the refund and the synchronous Spaces delete both happen in settlement-job,
    which already owns the Prisma transaction + ledger-entry pattern for
    every other refund path.
    """
    with conn.cursor() as cur:
        cur.execute(
            REJECT_WORD_RECORDING_SQL,
            {"record_id": word_recording_id, "rejection_reason": rejection_reason},
        )
        if cur.rowcount == 0:
            logger.warning(
                "reject_word_recording matched 0 rows for word_recording=%s",
                word_recording_id,
            )
    conn.commit()


def reject_domain_conversation_recording(
    conn, recording_id: str, rejection_reason: str
) -> None:
    """
    Mirrors reject_word_recording -- settlement-job's
    refundRejectedDomainConversationRecordings() sweep picks this up the
    same way.
    """
    with conn.cursor() as cur:
        cur.execute(
            REJECT_DOMAIN_CONVERSATION_RECORDING_SQL,
            {"record_id": recording_id, "rejection_reason": rejection_reason},
        )
        if cur.rowcount == 0:
            logger.warning(
                "reject_domain_conversation_recording matched 0 rows for domain_conversation_recording=%s",
                recording_id,
            )
    conn.commit()
