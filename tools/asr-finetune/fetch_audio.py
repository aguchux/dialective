"""Download the audio listed in rows.jsonl and convert it to 16 kHz mono WAV.

Runs on the GPU box. Needs ffmpeg on PATH (`winget install Gyan.FFmpeg`) and
a Spaces key in SPACES_ENDPOINT / SPACES_ACCESS_KEY / SPACES_SECRET_KEY --
the same variable names whisper-worker uses. Give this machine a READ-ONLY
key scoped to the recordings bucket, not the cluster's read-write one.

Safe to re-run: clips already converted are skipped, so an interrupted
download resumes where it stopped.

Writes <data>/<dialect>/audio/<id>.wav and <data>/<dialect>/manifest.jsonl,
which is what train.py and evaluate.py read.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
import soundfile as sf
from botocore.exceptions import ClientError

from common import MAX_CLIP_S, MIN_CLIP_S, SAMPLE_RATE, read_jsonl, write_jsonl


def spaces_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("SPACES_ENDPOINT"),
        region_name=os.environ.get("SPACES_REGION", "nyc3"),
        aws_access_key_id=os.environ.get("SPACES_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("SPACES_SECRET_KEY"),
    )


def fetch_one(s3, row: dict, audio_dir: Path) -> tuple[str, dict | None]:
    wav = audio_dir / f"{row['id']}.wav"
    if not wav.exists():
        suffix = Path(row["key"]).suffix or ".webm"
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / f"src{suffix}"
            try:
                s3.download_file(row["bucket"], row["key"], str(src))
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                # Purged by audio-retention-job after the export ran.
                return (
                    "missing" if code in ("404", "NoSuchKey") else "download_error"
                ), None
            part = Path(tmp) / "out.wav"
            proc = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(src),
                    "-ar",
                    str(SAMPLE_RATE),
                    "-ac",
                    "1",
                    "-f",
                    "wav",
                    str(part),
                ],
                capture_output=True,
            )
            if proc.returncode != 0:
                return "unreadable", None
            shutil.move(str(part), str(wav))
    try:
        duration = sf.info(str(wav)).duration
    except RuntimeError:
        wav.unlink(missing_ok=True)
        return "unreadable", None
    if not MIN_CLIP_S <= duration <= MAX_CLIP_S:
        return "duration_out_of_range", None
    out = {
        k: row[k]
        for k in (
            "id",
            "speaker",
            "split",
            "dialect",
            "text",
            "noise_rating",
            "is_redo",
            "reverse_validated",
        )
    }
    out["audio"] = f"audio/{wav.name}"
    out["duration_s"] = round(duration, 3)
    return "ok", out


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="e.g. data/ha (contains rows.jsonl)",
    )
    p.add_argument("--workers", type=int, default=8)
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="only fetch the first N rows (for a quick trial)",
    )
    args = p.parse_args()

    if shutil.which("ffmpeg") is None:
        raise SystemExit(
            "ffmpeg not found on PATH -- install it first (winget install Gyan.FFmpeg)"
        )
    if not os.environ.get("SPACES_ACCESS_KEY"):
        raise SystemExit("Set SPACES_ENDPOINT, SPACES_ACCESS_KEY and SPACES_SECRET_KEY")

    rows = read_jsonl(args.data_dir / "rows.jsonl")
    if args.limit:
        rows = rows[: args.limit]
    audio_dir = args.data_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    s3 = spaces_client()
    kept, outcomes = [], Counter()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(fetch_one, s3, r, audio_dir) for r in rows]
        for i, fut in enumerate(as_completed(futures), 1):
            outcome, out = fut.result()
            outcomes[outcome] += 1
            if out:
                kept.append(out)
            if i % 500 == 0 or i == len(futures):
                print(
                    f"  {i}/{len(futures)}  "
                    + "  ".join(f"{k}={v}" for k, v in sorted(outcomes.items())),
                    flush=True,
                )

    kept.sort(key=lambda r: r["id"])
    write_jsonl(args.data_dir / "manifest.jsonl", kept)
    hours = sum(r["duration_s"] for r in kept) / 3600
    by_split = Counter(r["split"] for r in kept)
    print(
        f"manifest.jsonl: {len(kept)} clips, {hours:.1f} h  (train {by_split['train']}, dev {by_split['dev']}, test {by_split['test']})"
    )


if __name__ == "__main__":
    main()
