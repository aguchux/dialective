"""
Covers ResilientConnection's reconnect-on-failure behavior -- see its
docstring in db.py for the production incident this fixes (a single
process-lifetime psycopg2 connection silently poisoning every job on a
pod once Postgres closes it out from under the worker).
"""

import os
from unittest.mock import MagicMock, patch

import psycopg2

from db import ResilientConnection


@patch.dict(os.environ, {"DATABASE_URL": "postgresql://test/test"})
def test_resilient_connection_reconnects_on_cursor_interface_error():
    first_conn = MagicMock(name="first_conn")
    second_conn = MagicMock(name="second_conn")
    with patch("db.psycopg2.connect", side_effect=[first_conn, second_conn]):
        conn = ResilientConnection()
        first_conn.cursor.side_effect = psycopg2.InterfaceError("connection already closed")

        result = conn.cursor()

    first_conn.close.assert_called_once()
    second_conn.cursor.assert_called_once()
    assert result is second_conn.cursor.return_value


@patch.dict(os.environ, {"DATABASE_URL": "postgresql://test/test"})
def test_resilient_connection_reconnects_on_commit_operational_error():
    first_conn = MagicMock(name="first_conn")
    second_conn = MagicMock(name="second_conn")
    with patch("db.psycopg2.connect", side_effect=[first_conn, second_conn]):
        conn = ResilientConnection()
        first_conn.commit.side_effect = psycopg2.OperationalError("server closed the connection")

        conn.commit()

    first_conn.close.assert_called_once()
    assert conn._conn is second_conn


@patch.dict(os.environ, {"DATABASE_URL": "postgresql://test/test"})
def test_resilient_connection_does_not_reconnect_when_healthy():
    first_conn = MagicMock(name="first_conn")
    with patch("db.psycopg2.connect", side_effect=[first_conn]) as mock_connect:
        conn = ResilientConnection()

        conn.cursor()
        conn.commit()

    first_conn.close.assert_not_called()
    assert mock_connect.call_count == 1
