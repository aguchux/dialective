"""Export a labelled-recording manifest for one dialect from Postgres.

Run this where you already have database access (e.g. via
`kubectl port-forward -n dai svc/postgres 5432:5432`), NOT on the GPU box:
the GPU box only ever needs the resulting rows.jsonl plus a read-only Spaces
key, never database credentials.

The session is opened READ ONLY, so this cannot write to the database even
if the query below is edited badly.

Which audio counts as labelled:
  * ENGLISH_TO_DIALECT rows only. Their translationText is the dialect text
    the audio says. A DIALECT_TO_ENGLISH row's translationText is ENGLISH (the
    listener's answer), so it is never a label for its own audio -- its audio
    is already covered by the ENGLISH_TO_DIALECT "redo" row api inserts with
    the same audioKey and the source recording's text.
  * Terminal and accepted (SCORED/SETTLED), audio not purged, not marked
    INVALID by an admin audit, no WRONG_DIALECT flags, and not voted down by
    more word validators than voted it up.
  * asrMatchScore is deliberately NOT used as a filter: it measures agreement
    with the model being replaced, so filtering on it would only keep clips
    the current model already gets right.
"""

from __future__ import annotations

import argparse
import os
from collections import Counter
from pathlib import Path

import psycopg2
import psycopg2.extras

from common import clean_label, speaker_hash, split_for_speaker, write_jsonl

QUERY = """
SELECT
  r.id,
  r."userId"                        AS user_id,
  r."dialectTag"                    AS dialect,
  r."translationText"               AS text,
  r."audioBucket"                   AS bucket,
  r."audioKey"                      AS key,
  r."durationMs"                    AS duration_ms,
  r."noiseRating"::text             AS noise_rating,
  r."livenessScore"::float          AS liveness,
  (r."redoOfRecordingId" IS NOT NULL) AS is_redo,
  EXISTS (
    SELECT 1
    FROM word_training_assignments a
    JOIN word_recordings v ON v."assignmentId" = a.id
    WHERE a."sourceRecordingId" = r.id
      AND v.direction = 'DIALECT_TO_ENGLISH'
      AND v."validationScore" >= %(rv_threshold)s
  )                                 AS reverse_validated,
  COALESCE(wv.correct, 0)           AS validations_correct,
  COALESCE(wv.wrong, 0)             AS validations_wrong
FROM word_recordings r
LEFT JOIN (
  SELECT "recordingId",
         count(*) FILTER (WHERE "isCorrectMatch" IS TRUE)  AS correct,
         count(*) FILTER (WHERE "isCorrectMatch" IS FALSE) AS wrong
  FROM word_validations
  GROUP BY 1
) wv ON wv."recordingId" = r.id
WHERE r."dialectTag" = %(dialect)s
  AND r.direction = 'ENGLISH_TO_DIALECT'
  AND r.status IN ('SCORED', 'SETTLED')
  AND r."audioKey" IS NOT NULL
  AND r."audioDeletedAt" IS NULL
  AND (r."adminAuditStatus" IS NULL OR r."adminAuditStatus" <> 'INVALID')
  AND r."wrongDialectFlagCount" = 0
  AND (r."livenessScore" IS NULL OR r."livenessScore" >= %(min_liveness)s)
  AND length(trim(r."translationText")) > 0
ORDER BY r."createdAt"
"""


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--dialect", required=True, help="dialectTag, e.g. ha, yo, ibb")
    p.add_argument(
        "--out",
        type=Path,
        default=Path("data"),
        help="writes <out>/<dialect>/rows.jsonl",
    )
    p.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    p.add_argument(
        "--min-liveness",
        type=float,
        default=50.0,
        help="0-100; rows the gate never scored are kept",
    )
    p.add_argument(
        "--rv-threshold",
        type=float,
        default=0.8,
        help="validationScore counted as a reverse-validation pass",
    )
    p.add_argument(
        "--verified-only",
        action="store_true",
        help="keep only clips another trainer reverse-validated",
    )
    p.add_argument(
        "--exclude-noisy",
        action="store_true",
        help="drop clips the trainer rated NOISY",
    )
    p.add_argument("--test-pct", type=int, default=10)
    p.add_argument("--dev-pct", type=int, default=5)
    args = p.parse_args()

    if not args.database_url:
        raise SystemExit("Set DATABASE_URL or pass --database-url")

    conn = psycopg2.connect(args.database_url)
    conn.set_session(readonly=True)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                QUERY,
                {
                    "dialect": args.dialect,
                    "min_liveness": args.min_liveness,
                    "rv_threshold": args.rv_threshold,
                },
            )
            raw = cur.fetchall()
    finally:
        conn.close()

    rows, seen_keys, dropped = [], set(), Counter()
    for r in raw:
        text = clean_label(r["text"])
        if not text:
            dropped["empty_text"] += 1
            continue
        if r["key"] in seen_keys:
            dropped["duplicate_audio"] += 1
            continue
        if r["validations_wrong"] > r["validations_correct"]:
            dropped["voted_down"] += 1
            continue
        if args.verified_only and not r["reverse_validated"]:
            dropped["not_reverse_validated"] += 1
            continue
        if args.exclude_noisy and r["noise_rating"] == "NOISY":
            dropped["noisy"] += 1
            continue
        seen_keys.add(r["key"])
        spk = speaker_hash(r["user_id"])
        rows.append(
            {
                "id": r["id"],
                "speaker": spk,
                "split": split_for_speaker(spk, args.test_pct, args.dev_pct),
                "dialect": r["dialect"],
                "text": text,
                "bucket": r["bucket"],
                "key": r["key"],
                "duration_ms": r["duration_ms"],
                "noise_rating": r["noise_rating"],
                "liveness": r["liveness"],
                "is_redo": r["is_redo"],
                "reverse_validated": r["reverse_validated"],
            }
        )

    out = args.out / args.dialect / "rows.jsonl"
    write_jsonl(out, rows)

    by_split = Counter(r["split"] for r in rows)
    speakers = {
        s: len({r["speaker"] for r in rows if r["split"] == s})
        for s in ("train", "dev", "test")
    }
    hours = sum((r["duration_ms"] or 0) for r in rows) / 3_600_000
    print(
        f"{args.dialect}: {len(raw)} candidate rows, {len(rows)} kept, ~{hours:.1f} h of audio -> {out}"
    )
    for s in ("train", "dev", "test"):
        print(f"  {s:5} {by_split[s]:7} clips  {speakers[s]:5} speakers")
    print(f"  reverse-validated: {sum(r['reverse_validated'] for r in rows)}")
    if dropped:
        print("  dropped: " + ", ".join(f"{k}={v}" for k, v in dropped.items()))
    if speakers["test"] < 5:
        print(
            "  WARNING: fewer than 5 test speakers -- WER on this split will be noisy. Consider --test-pct 20."
        )


if __name__ == "__main__":
    main()
