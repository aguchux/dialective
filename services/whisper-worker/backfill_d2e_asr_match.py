"""
One-off: recompute asrMatchScore for DIALECT_TO_ENGLISH word recordings.

Why these rows are wrong: on a DIALECT_TO_ENGLISH assignment the trainer
hears a dialect clip, types the ENGLISH meaning, then records their own
DIALECT pronunciation ("not the English you typed above" --
WordTrainingDialog.tsx). api sent the typed English as expected_text, so a
dialect transcript was compared against English and correct work scored
near zero: 21,852 rows averaged 13.7 where ENGLISH_TO_DIALECT averaged
55.4, and 7,961 scored exactly 0.

Nobody was underpaid, because PlatformSettings.qualityWeightAsrMatch is 0
and asrMatchScore only reaches payout through it. The point of this
backfill is that the weight cannot be raised until history is right.

The correct comparison text is the SOURCE recording's translationText --
the dialect text the audio actually contains -- reached via
word_training_assignments.sourceRecordingId. 21,935 of 21,938 scored rows
resolve that way (99.99%); the rest are left untouched rather than guessed.

Scores are recomputed with db.py's own normalize_for_match/char_similarity
rather than a reimplementation, so a backfilled row is byte-identical to
what the worker would have written at the time.

Run from services/whisper-worker (needs DATABASE_URL):
    python backfill_d2e_asr_match.py           # dry run
    python backfill_d2e_asr_match.py --apply   # execute
"""
import os
import sys

import psycopg2
import psycopg2.extras

from db import char_similarity, compute_asr_match_score, normalize_for_match  # noqa: F401

APPLY = "--apply" in sys.argv
BATCH = 500

SELECT_SQL = """
SELECT w.id,
       w.transcript,
       w."asrMatchScore" AS old_score,
       src."translationText" AS dialect_text
FROM word_recordings w
JOIN word_training_assignments a ON a.id = w."assignmentId"
JOIN word_recordings src ON src.id = a."sourceRecordingId"
WHERE w.direction = 'DIALECT_TO_ENGLISH'
  AND w."asrMatchScore" IS NOT NULL
  AND w.transcript IS NOT NULL
  AND w.transcript <> ''
  AND src."translationText" IS NOT NULL
  AND src."translationText" <> ''
ORDER BY w.id
"""


def main() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL is not set")

    with psycopg2.connect(dsn) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(SELECT_SQL)
            rows = cur.fetchall()

        print(f"{'APPLYING' if APPLY else 'DRY RUN'} -- candidates: {len(rows)}")

        updates = []
        unchanged = 0
        for row in rows:
            new_score = compute_asr_match_score(row["transcript"], row["dialect_text"])
            old_score = float(row["old_score"])
            if abs(new_score - old_score) < 0.005:
                unchanged += 1
                continue
            updates.append((new_score, row["id"]))

        if updates:
            olds = [float(r["old_score"]) for r in rows]
            news = [u[0] for u in updates]
            print(f"  changing:  {len(updates)}")
            print(f"  unchanged: {unchanged}")
            print(f"  old mean:  {sum(olds) / len(olds):.2f}")
            print(f"  new mean (changed rows): {sum(news) / len(news):.2f}")
            print(f"  old zeros: {sum(1 for o in olds if o == 0)}")
            print(f"  new zeros (changed rows): {sum(1 for n in news if n == 0)}")
            print("\n  sample:")
            for row in rows[:6]:
                recomputed = compute_asr_match_score(row["transcript"], row["dialect_text"])
                print(
                    f"    heard={row['transcript'][:24]!r:28} "
                    f"dialect={row['dialect_text'][:20]!r:24} "
                    f"{float(row['old_score']):6.2f} -> {recomputed:6.2f}"
                )

        if not APPLY:
            print("\nNothing changed. Re-run with --apply to execute.")
            return

        # Batched so a single statement never holds a long write lock over
        # ~22k rows; each batch commits on its own, so an interruption
        # leaves a consistent partial result that a re-run finishes (the
        # recompute is idempotent -- identical inputs, identical output).
        written = 0
        with conn.cursor() as cur:
            for start in range(0, len(updates), BATCH):
                chunk = updates[start : start + BATCH]
                cur.executemany(
                    'UPDATE word_recordings SET "asrMatchScore" = %s WHERE id = %s',
                    chunk,
                )
                conn.commit()
                written += len(chunk)
                print(f"  committed {written}/{len(updates)}")

        print(f"\nupdated={written} unchanged={unchanged}")


if __name__ == "__main__":
    main()
