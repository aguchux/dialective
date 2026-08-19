#!/usr/bin/env python3
"""
Download a WAXAL ASR language's raw audio+transcript pairs into a local,
git-ignored directory (datasets/waxal/data/<lang>/raw/), resolving the
language through models/waxal-registry.yaml rather than hardcoding a
Hugging Face config name. See datasets/waxal/README.md for license and
language-coverage details.

--fixture mode synthesizes a tiny local dataset (no network, no dependency
on the real WAXAL dataset/license) purely to exercise the rest of the
pipeline (prepare.py/validate.py/benchmark.py) end-to-end.
"""

import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf
import yaml

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "models", "waxal-registry.yaml")
DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
WAXAL_HF_DATASET_ID = "google/WaxalNLP"

FIXTURE_TRANSCRIPTS = [
    "ndinofara kukuona",
    "mangwanani akanaka",
    "tatenda zvikuru",
]


def load_registry(path: str = REGISTRY_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def resolve_language(tag: str, registry: dict) -> dict:
    entry = registry.get(tag)
    if entry is None:
        raise SystemExit(
            f"'{tag}' is not registered in models/waxal-registry.yaml -- add it there first "
            "(only after confirming it's present in the actual WAXAL release)."
        )
    return entry


def download_fixture(tag: str, raw_dir: str) -> None:
    os.makedirs(raw_dir, exist_ok=True)
    sr = 16000
    for i, transcript in enumerate(FIXTURE_TRANSCRIPTS, start=1):
        duration_s = 1.5 + i * 0.5
        # A quiet tone, not silence -- vosk-worker's prefilter_ok-style
        # silence check would reject pure silence, and this fixture is
        # meant to exercise the full pipeline including that check.
        t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
        tone = 0.05 * np.sin(2 * np.pi * 220 * t)
        wav_path = os.path.join(raw_dir, f"{i:04d}.wav")
        sf.write(wav_path, tone.astype(np.float32), sr)
        txt_path = os.path.join(raw_dir, f"{i:04d}.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(transcript)
    print(f"Fixture dataset written to {raw_dir} ({len(FIXTURE_TRANSCRIPTS)} samples)")


def download_real(tag: str, config_name: str, raw_dir: str) -> None:
    # Imported lazily -- `datasets` is only needed for real downloads, not
    # for --fixture mode, so fixture-mode pipeline testing never requires
    # installing it.
    from datasets import load_dataset

    os.makedirs(raw_dir, exist_ok=True)
    print(f"Loading {WAXAL_HF_DATASET_ID} config={config_name} ...")
    ds = load_dataset(WAXAL_HF_DATASET_ID, config_name)

    count = 0
    for split_name, split in ds.items():
        for i, row in enumerate(split):
            audio = row["audio"]
            transcript = row.get("transcription", "")
            speaker_id = row.get("speaker_id", "")
            stem = f"{split_name}-{i:06d}"
            wav_path = os.path.join(raw_dir, f"{stem}.wav")
            sf.write(wav_path, audio["array"], audio["sampling_rate"])
            meta_path = os.path.join(raw_dir, f"{stem}.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({"transcript": transcript, "speakerId": speaker_id, "split": split_name}, f)
            count += 1
    print(f"Downloaded {count} samples to {raw_dir}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a WAXAL ASR language's raw data")
    parser.add_argument("--language", required=True, help="WAXAL ASR language tag, e.g. sna")
    parser.add_argument("--fixture", action="store_true", help="Synthesize a tiny local dataset instead of downloading real WAXAL data")
    args = parser.parse_args()

    raw_dir = os.path.join(DATA_ROOT, args.language, "raw")

    if args.fixture:
        download_fixture(args.language, raw_dir)
        return 0

    registry = load_registry()
    entry = resolve_language(args.language, registry)
    if not entry.get("enabled", False):
        raise SystemExit(f"'{args.language}' is registered but not enabled in models/waxal-registry.yaml")
    download_real(args.language, entry["configName"], raw_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
