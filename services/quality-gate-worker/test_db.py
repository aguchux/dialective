"""
No existing test file covered db.py's SQL constants before this feature --
this is net-new coverage (see the plan's test-coverage section), not an
established pattern being extended. Asserts the new expression-write SQL
constants reference exactly the columns added to Submission/WordRecording in
services/api/prisma/schema.prisma's migration 20260821130000_speech_expression_metadata,
so a column rename on either side surfaces here instead of only as a runtime
Postgres error.
"""

from unittest.mock import MagicMock

from db import (
    UPDATE_DOMAIN_CONVERSATION_RECORDING_SCORES_SQL,
    UPDATE_SUBMISSION_EXPRESSION_SQL,
    UPDATE_WORD_RECORDING_EXPRESSION_SQL,
    reject_domain_conversation_recording,
    write_scores,
)

EXPECTED_EXPRESSION_COLUMNS = {
    "emotion",
    '"emotionConfidence"',
    "tone",
    "style",
    "speed",
    "energy",
    '"prosodyMetrics"',
    '"expressionCheckedAt"',
}


def test_submission_expression_sql_references_expected_columns():
    for column in EXPECTED_EXPRESSION_COLUMNS:
        assert column in UPDATE_SUBMISSION_EXPRESSION_SQL


def test_word_recording_expression_sql_references_expected_columns():
    for column in EXPECTED_EXPRESSION_COLUMNS:
        assert column in UPDATE_WORD_RECORDING_EXPRESSION_SQL


def _mock_conn(rowcount: int = 1):
    conn = MagicMock()
    cursor = MagicMock()
    cursor.rowcount = rowcount
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn, cursor


# Regression: domain_conversation_recordings were created PENDING and never
# had a status/scoredAt transition wired in, unlike word_recordings (already
# SCORED at creation -- see WordsService.createRecording). Without this,
# settlement-job's settleDomainConversationRecordings() sweep (which only
# reads status='SCORED' rows) never saw a submitted recording, so it sat
# PENDING until the stuck-timeout sweep refunded it instead of ever paying
# out -- the root cause of "rewards not tracked" for this task type.
def test_write_scores_domain_conversation_recording_sets_status_scored():
    assert 'status = \'SCORED\'' in UPDATE_DOMAIN_CONVERSATION_RECORDING_SCORES_SQL
    assert '"scoredAt" = now()' in UPDATE_DOMAIN_CONVERSATION_RECORDING_SCORES_SQL


def test_write_scores_domain_conversation_recording_uses_the_right_table_and_sql():
    conn, cursor = _mock_conn()

    write_scores(
        conn,
        "domain_conversation_recording",
        "recording-1",
        noise_score=90.0,
        quality_score=85.0,
        liveness_score=95.0,
    )

    executed_sql = cursor.execute.call_args[0][0]
    assert executed_sql is UPDATE_DOMAIN_CONVERSATION_RECORDING_SCORES_SQL
    conn.commit.assert_called_once()


def test_reject_domain_conversation_recording_uses_its_own_table():
    conn, cursor = _mock_conn()

    reject_domain_conversation_recording(conn, "recording-1", "mostly_silence")

    executed_sql, params = cursor.execute.call_args[0]
    assert "domain_conversation_recordings" in executed_sql
    assert params == {"record_id": "recording-1", "rejection_reason": "mostly_silence"}
    conn.commit.assert_called_once()
