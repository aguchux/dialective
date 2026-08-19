#!/usr/bin/env python3
"""
Validate a WAXAL language's prepared manifest: every audioPath must exist
and be decodable, every transcript must be non-empty, and duration must be
within a sane bound. Prints a report of bad samples and exits non-zero if
any are found -- meant to gate the pipeline before benchmark.py runs.
"""

import argparse
import json
import os
import sys

import soundfile as sf

DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
REPO_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")

MIN_DURATION_S = 0.2
MAX_DURATION_S = 60.0


def validate_record(record: dict) -> str | None:
    """Returns a failure reason, or None if the record is valid."""
    audio_path = os.path.join(REPO_ROOT, record["audioPath"])
    if not os.path.exists(audio_path):
        return "missing_audio_file"

    try:
        info = sf.info(audio_path)
    except Exception:
        return "undecodable_audio"

    duration = info.frames / info.samplerate
    if duration <= 0:
        return "zero_duration"
    if duration < MIN_DURATION_S or duration > MAX_DURATION_S:
        return "duration_out_of_range"

    if not record.get("transcript", "").strip():
        return "empty_transcript"

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a WAXAL language's prepared manifest")
    parser.add_argument("--language", required=True, help="WAXAL ASR language tag, e.g. sna")
    args = parser.parse_args()

    manifest_path = os.path.join(DATA_ROOT, args.language, "manifest.jsonl")
    if not os.path.exists(manifest_path):
        raise SystemExit(f"No manifest at {manifest_path} -- run prepare.py --language {args.language} first")

    total = 0
    failures = []
    with open(manifest_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            total += 1
            reason = validate_record(record)
            if reason:
                failures.append((record["audioPath"], reason))

    print(f"Validated {total} record(s) for language={args.language}")
    if failures:
        print(f"{len(failures)} sample(s) failed validation:")
        for audio_path, reason in failures:
            print(f"  - {audio_path}: {reason}")
        return 1

    print("All samples valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
