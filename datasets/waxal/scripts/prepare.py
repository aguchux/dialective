#!/usr/bin/env python3
"""
Normalize download.py's raw output for one WAXAL language into the common
speech-dataset manifest format (see manifest.example.json), written to
datasets/waxal/data/<lang>/manifest.jsonl -- one JSON record per line.

dialectTag is always literal null: WAXAL is language-level data, and this
repo never invents dialect tags for it (see README.md).
"""

import argparse
import json
import os
import sys

import soundfile as sf
import yaml

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "models", "waxal-registry.yaml")
DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "data")


def load_registry(path: str = REGISTRY_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def read_duration_seconds(wav_path: str) -> float:
    info = sf.info(wav_path)
    return round(info.frames / info.samplerate, 3)


def load_sidecar_transcript(stem_path: str) -> tuple[str, str | None, str | None]:
    """
    download.py writes either a plain .txt sidecar (fixture mode) or a
    .json sidecar with {transcript, speakerId, split} (real mode). Support
    both so prepare.py doesn't care which mode produced the raw data.
    """
    json_path = f"{stem_path}.json"
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        return meta.get("transcript", ""), meta.get("speakerId"), meta.get("split")

    txt_path = f"{stem_path}.txt"
    if os.path.exists(txt_path):
        with open(txt_path, "r", encoding="utf-8") as f:
            return f.read().strip(), None, None

    return "", None, None


def prepare(tag: str, language_name: str) -> list[dict]:
    raw_dir = os.path.join(DATA_ROOT, tag, "raw")
    if not os.path.isdir(raw_dir):
        raise SystemExit(f"No raw data found at {raw_dir} -- run download.py --language {tag} first")

    records = []
    for filename in sorted(os.listdir(raw_dir)):
        if not filename.endswith(".wav"):
            continue
        stem = filename[: -len(".wav")]
        wav_path = os.path.join(raw_dir, filename)
        stem_path = os.path.join(raw_dir, stem)
        transcript, speaker_id, split = load_sidecar_transcript(stem_path)

        records.append(
            {
                "dataset": "waxal",
                "language": language_name,
                "languageTag": tag,
                "dialectTag": None,
                # Always forward-slash, regardless of host OS -- this path
                # is stored in a committed-format manifest and consumed by
                # tools (benchmark.py) that may run on a different OS/in a
                # Linux container than whatever generated it.
                "audioPath": os.path.relpath(
                    wav_path, start=os.path.join(os.path.dirname(__file__), "..", "..", "..")
                ).replace(os.sep, "/"),
                "transcript": transcript,
                "durationSeconds": read_duration_seconds(wav_path),
                "speakerId": speaker_id,
                "split": split or "unknown",
            }
        )
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize a WAXAL language's raw data into the common manifest format")
    parser.add_argument("--language", required=True, help="WAXAL ASR language tag, e.g. sna")
    args = parser.parse_args()

    registry = load_registry()
    entry = registry.get(args.language, {})
    language_name = entry.get("name", args.language)

    records = prepare(args.language, language_name)
    if not records:
        raise SystemExit(f"No .wav files found under datasets/waxal/data/{args.language}/raw/")

    manifest_path = os.path.join(DATA_ROOT, args.language, "manifest.jsonl")
    with open(manifest_path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record) + "\n")

    print(f"Wrote {len(records)} records to {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
