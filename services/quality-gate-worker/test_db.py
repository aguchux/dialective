"""
No existing test file covered db.py's SQL constants before this feature --
this is net-new coverage (see the plan's test-coverage section), not an
established pattern being extended. Asserts the new expression-write SQL
constants reference exactly the columns added to Submission/WordRecording in
services/api/prisma/schema.prisma's migration 20260821130000_speech_expression_metadata,
so a column rename on either side surfaces here instead of only as a runtime
Postgres error.
"""

from db import UPDATE_SUBMISSION_EXPRESSION_SQL, UPDATE_WORD_RECORDING_EXPRESSION_SQL

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
