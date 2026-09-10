"""
One-off backfill: requeue existing WordRecording rows for ASR transcription
after a dialect_tag gets a new models/asr-registry.yaml entry.

Why this is needed: words.service.ts only attaches asr_stream to a
quality-gate-jobs message using the registry state AT THE TIME OF ORIGINAL
SUBMISSION (see AsrRegistryService.resolve in words.service.ts). A
WordRecording submitted before its dialect had a registry entry never had
ASR queued at all -- transcript stayed permanently null, indistinguishable
in the DB from "ASR hasn't run yet" vs. "was unsupported when submitted".
Adding the registry entry today does not retroactively touch old rows.

This script re-publishes directly to asr-jobs-whisper in the exact payload
shape quality-gate-worker/worker.py normally builds for record_kind ==
"word_recording" (see that file's asr_payload construction), skipping the
quality-gate step entirely since noise/liveness/quality scoring already
happened at original submission -- only the ASR leg is missing. Per
whisper-worker/db.py's UPDATE_WORD_RECORDING_ASR_SQL comment, writing
transcript/asrWordDetail/asrMatchScore has no WHERE-clause status guard and
is safe against a recording that's already SCORED or SETTLED.

Run once, manually, against a specific dialect_tag:

    DATABASE_URL=... REDIS_HOST=... REDIS_PORT=... \
        python tools/backfill-asr-transcripts.py --dialect-tag rw [--dry-run]

Skips rows whose audio has already been purged by audio-retention-job
(audioBucket/audioKey null) -- ASR cannot run without the audio object, and
this script does not touch or restore retention state.
"""

import argparse
import os

import psycopg2
import psycopg2.extras
import redis

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
ASR_STREAM = "asr-jobs-whisper"

SELECT_BACKLOG_SQL = """
SELECT id, "translationText", "audioBucket", "audioKey"
FROM word_recordings
WHERE "dialectTag" = %(dialect_tag)s
  AND transcript IS NULL
  AND "audioBucket" IS NOT NULL
  AND "audioKey" IS NOT NULL
ORDER BY "createdAt" ASC
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dialect-tag",
        required=True,
        help="dialect_tag to backfill, e.g. rw -- must already have a whisper entry in models/asr-registry.yaml",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="list matching rows without publishing anything",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(SELECT_BACKLOG_SQL, {"dialect_tag": args.dialect_tag})
            rows = cur.fetchall()
    finally:
        conn.close()

    print(f"Found {len(rows)} {args.dialect_tag} recording(s) with no transcript and audio still present.")

    if args.dry_run or not rows:
        for row in rows:
            print(f"  would requeue {row['id']}")
        return

    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    for row in rows:
        payload = {
            "word_recording_id": row["id"],
            "dialect_tag": args.dialect_tag,
            "expected_text": row["translationText"],
            "bucket": row["audioBucket"],
            "audio_key": row["audioKey"],
        }
        redis_client.xadd(ASR_STREAM, payload)
        print(f"  requeued {row['id']}")

    print(f"Done -- {len(rows)} job(s) published to {ASR_STREAM}.")


if __name__ == "__main__":
    main()
