"""Score any Whisper checkpoint on a prepared split -- WER, CER, exact match.

  python evaluate.py --data-dir data/ha --model NCAIR1/Hausa-ASR        # what production runs today
  python evaluate.py --data-dir data/ha --model runs/ha-lora/merged      # a merged fine-tune
  python evaluate.py --data-dir data/ha --run runs/ha-lora               # best/ adapter on its base

Writes per-clip predictions next to the summary so you can read what the
model actually got wrong -- a WER number alone does not tell you whether the
errors are spelling conventions or real misrecognitions.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from common import (
    configure_language,
    finalize_generation_config,
    load_split,
    score,
    transcribe_rows,
    write_jsonl,
)
from train import load_base, load_processor, load_tuned


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--data-dir", type=Path, required=True)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--model", help="HF id or local dir of a full checkpoint")
    g.add_argument(
        "--run", type=Path, help="a train.py run dir; scores its best/ checkpoint"
    )
    p.add_argument(
        "--language",
        help="force a language token (default: whatever the checkpoint/run uses)",
    )
    p.add_argument("--split", default="test", choices=["train", "dev", "test"])
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument(
        "--out",
        type=Path,
        help="predictions JSONL (default: next to the run, or ./eval-<split>.jsonl)",
    )
    args = p.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    rows = load_split(args.data_dir, args.split)
    if args.limit:
        rows = rows[: args.limit]

    if args.run:
        cfg = json.loads((args.run / "run_config.json").read_text(encoding="utf-8"))
        model, processor = load_tuned(
            args.run, "best", cfg["base"], device, args.language or cfg["language"]
        )
        label = f"{args.run}/best"
        out = args.out or args.run / f"eval-{args.split}.jsonl"
    else:
        processor = load_processor(args.model)
        model = load_base(args.model, device)
        configure_language(model, processor, args.language)
        finalize_generation_config(model, processor)
        label = args.model
        out = args.out or Path(f"eval-{args.split}.jsonl")

    hyps = transcribe_rows(
        model, processor, rows, args.data_dir, device, batch_size=args.batch_size
    )
    result = score([r["text"] for r in rows], hyps)
    write_jsonl(
        out, [{"id": r["id"], "ref": r["text"], "hyp": h} for r, h in zip(rows, hyps)]
    )
    print(
        json.dumps({"model": label, "split": args.split, **result}, ensure_ascii=False)
    )
    print(f"predictions: {out}")


if __name__ == "__main__":
    main()
