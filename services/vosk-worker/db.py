import json
import logging
import os
import re

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

# No WHERE-clause status guard here, unlike UPDATE_SUBMISSION_SQL -- ASR is a
# pure annotation for word recordings (never gates/delays reaching SCORED,
# see schema.prisma's WordRecording.status comment), so there's no PENDING
# window this needs to race against; a WordRecording can legitimately already
# be SCORED (or even SETTLED) by the time this lands, and that's fine to
# annotate regardless.
UPDATE_WORD_RECORDING_ASR_SQL = """
UPDATE word_recordings
SET transcript = %(transcript)s,
    "asrConfidence" = %(asr_confidence)s,
    "asrEngine" = %(asr_engine)s,
    "asrWordDetail" = %(asr_word_detail)s,
    "asrMatchScore" = %(asr_match_score)s
WHERE id = %(word_recording_id)s
"""


def build_db_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def mean_confidence(word_confidences: list) -> float | None:
    if not word_confidences:
        return None
    return sum(w["conf"] for w in word_confidences) / len(word_confidences)


def normalize_for_match(text: str) -> str:
    """
    Lowercases and strips whitespace/punctuation, but deliberately keeps
    every non-ASCII character (diacritics are meaningful in dialect text --
    mirrors consensus-scorer's normalizeTranscript, which preserves them for
    the same reason; unlike words.service.ts's normalizeAnswer, which is
    English-only and safe to strip to ASCII since it only ever compares
    against a known English word).
    """
    return re.sub(r"[.,!?;:\"'()\[\]{}]", "", text.strip().lower())


def char_similarity(a: str, b: str) -> float:
    """1 - (character-level edit distance / longer string length), in [0, 1]. Word recordings are typically 1-2 words, so character-level is more forgiving of ASR mis-segmentation than consensus-scorer's word-level tokenSimilarity."""
    if not a and not b:
        return 1.0
    max_len = max(len(a), len(b), 1)
    rows, cols = len(a) + 1, len(b) + 1
    dist = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        dist[i][0] = i
    for j in range(cols):
        dist[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dist[i][j] = min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost)
    return 1 - dist[rows - 1][cols - 1] / max_len


def compute_asr_match_score(transcript: str, expected_text: str) -> float:
    """0-100 similarity between the ASR transcript and the trainer's typed answer -- see WordRecording.asrMatchScore's schema comment."""
    return round(char_similarity(normalize_for_match(transcript), normalize_for_match(expected_text)) * 100, 2)


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


def update_word_recording_result(
    conn,
    word_recording_id: str,
    *,
    transcript: str,
    expected_text: str,
    word_confidences: list,
    engine: str,
) -> None:
    """
    Annotates a WordRecording with ASR output -- always unconditional (see
    UPDATE_WORD_RECORDING_ASR_SQL's comment), never touches status/score.
    0 rows matched means the row was deleted or never existed; logged, not
    raised, same tolerance as update_submission_result.
    """
    with conn.cursor() as cur:
        cur.execute(
            UPDATE_WORD_RECORDING_ASR_SQL,
            {
                "word_recording_id": word_recording_id,
                "transcript": transcript,
                "asr_confidence": mean_confidence(word_confidences),
                "asr_engine": engine,
                "asr_word_detail": json.dumps(word_confidences) if word_confidences else None,
                "asr_match_score": compute_asr_match_score(transcript, expected_text),
            },
        )
        if cur.rowcount == 0:
            logger.warning("update_word_recording_result matched 0 rows for word_recording=%s", word_recording_id)
    conn.commit()
