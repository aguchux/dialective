"""
One-off backfill: re-publish quality-gate-jobs for DomainConversationRecording
rows that are still PENDING because their original job was queued behind a
huge, already-fully-processed word_recording backlog on the shared
quality-gate-jobs stream (the same stream vosk-worker/whisper-worker/
quality-gate-worker consumers all share).

Why this is needed: XADD appends every record kind onto the same stream in
submission order, and the quality-gate-workers consumer group reads strictly
in that order. If the group's read cursor falls far behind (as happened here
-- see the incident notes this script was written for), a domain
conversation submitted today sits behind days of unrelated, already-settled
word_recording traffic before the worker ever reaches it. Re-publishing a
fresh message for just the still-PENDING domain conversation rows puts them
at the current tail of the stream, where the (already-caught-up) consumer
group picks them up immediately, instead of waiting for it to wade through
history that has nothing left to do.

Safe to run multiple times / re-run after a partial failure: querying
status='PENDING' only picks up rows that haven't been scored yet, and
write_scores (quality-gate-worker/db.py) has no ordering dependency on
resubmission -- an old, already-in-flight copy of the same job landing after
this one just re-writes the same score fields harmlessly if it's ever
delivered too (there is no correctness issue from the duplicate, only a
wasted evaluation on the version whichever one runs second).

Run once, manually:

    DATABASE_URL=... REDIS_HOST=... REDIS_PORT=... \
        python tools/backfill-domain-conversation-scoring.py [--dry-run]

Skips rows whose audio has already been purged (audioBucket/audioKey null)
-- quality-gate-worker cannot score without the audio object.
"""

import argparse
import os

import psycopg2
import psycopg2.extras
import redis

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
QUALITY_GATE_STREAM = os.environ.get("QUALITY_GATE_STREAM", "quality-gate-jobs")

SELECT_BACKLOG_SQL = """
SELECT id, "audioBucket", "audioKey", "dialectTag"
FROM domain_conversation_recordings
WHERE status = 'PENDING'
  AND "audioBucket" IS NOT NULL
  AND "audioKey" IS NOT NULL
ORDER BY "createdAt" ASC
"""

SELECT_MAX_DURATION_SQL = """
SELECT "domainConversationMaxDurationSeconds" FROM platform_settings LIMIT 1
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="list matching rows without publishing anything",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(SELECT_BACKLOG_SQL)
            rows = cur.fetchall()
            cur.execute(SELECT_MAX_DURATION_SQL)
            max_duration_row = cur.fetchone()
    finally:
        conn.close()

    if not max_duration_row:
        raise SystemExit("platform_settings row not found -- refusing to guess a max duration")
    # Must match domain-conversations.service.ts's own max_duration_s publish
    # exactly, including its +5s grace period -- omitting max_duration_s
    # entirely made worker.py's prefilter fall back to its flat 15s module
    # default instead of the real (larger) admin-configured limit; omitting
    # just the grace still wrongly hard-rejects a submission whose
    # ffmpeg-decoded duration comes out fractionally over the bare limit
    # (container/codec framing, not a real recording-length difference) even
    # though the original submit endpoint already accepted it under the same
    # grace. See the incident this script was patched for.
    DURATION_GRACE_S = 5
    max_duration_s = max_duration_row["domainConversationMaxDurationSeconds"] + DURATION_GRACE_S
    print(f"Using max_duration_s={max_duration_s} (admin limit + {DURATION_GRACE_S}s grace) for every requeued job.")

    print(f"Found {len(rows)} PENDING domain conversation recording(s) with audio still present.")

    if args.dry_run or not rows:
        for row in rows:
            print(f"  would requeue {row['id']}")
        return

    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    for row in rows:
        payload = {
            "record_kind": "domain_conversation_recording",
            "word_recording_id": row["id"],
            "bucket": row["audioBucket"],
            "audio_key": row["audioKey"],
            "max_duration_s": str(max_duration_s),
            "dialect_tag": row["dialectTag"],
        }
        redis_client.xadd(QUALITY_GATE_STREAM, payload)

    print(f"Done -- {len(rows)} job(s) published to {QUALITY_GATE_STREAM}.")


if __name__ == "__main__":
    main()
