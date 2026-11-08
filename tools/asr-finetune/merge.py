"""Turn a run's best/ checkpoint into a standalone model whisper-worker can load.

whisper-worker loads models with transformers' pipeline() from a Hugging Face
repo id, so the deployable artifact is a FULL checkpoint (LoRA merged into
the base weights) with its processor files and generation config:

  python merge.py --run runs/ha-lora                          # -> runs/ha-lora/merged/
  python merge.py --run runs/ha-lora --push-to-hub you/dl-hausa-asr-v1

Refuses to merge a run whose report.json does not say IMPROVED, unless
--force: a fine-tune that is worse on held-out speakers should not reach
production by accident.

The merged dir includes preprocessor_config.json, tokenizer files and a
generation_config.json with no_timestamps_token_id and alignment_heads
filled in -- the exact gaps models/asr-registry.yaml records as having broken
community checkpoints at load time in production.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from common import finalize_generation_config
from train import load_tuned


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--run", type=Path, required=True)
    p.add_argument("--out", type=Path, help="default: <run>/merged")
    p.add_argument(
        "--push-to-hub",
        metavar="REPO_ID",
        help="upload as a PRIVATE Hugging Face repo (needs HF_TOKEN)",
    )
    p.add_argument(
        "--force", action="store_true", help="merge even if report.json is not IMPROVED"
    )
    args = p.parse_args()

    report_path = args.run / "report.json"
    report = (
        json.loads(report_path.read_text(encoding="utf-8"))
        if report_path.exists()
        else {}
    )
    if not str(report.get("verdict", "")).startswith("IMPROVED") and not args.force:
        raise SystemExit(
            f"{report_path}: verdict is {report.get('verdict', 'missing')!r}. Re-run with --force to merge anyway."
        )

    cfg = json.loads((args.run / "run_config.json").read_text(encoding="utf-8"))
    # Merge on CPU: it needs the base and the adapter in memory at once, and
    # there is far more system RAM than VRAM on the P600 box.
    model, processor = load_tuned(
        args.run, "best", cfg["base"], torch.device("cpu"), cfg["language"]
    )
    finalize_generation_config(model, processor)
    model.config.use_cache = True

    out = args.out or args.run / "merged"
    model.save_pretrained(str(out), safe_serialization=True)
    processor.save_pretrained(str(out))
    model.generation_config.save_pretrained(str(out))
    (out / "dialect_library_finetune.json").write_text(
        json.dumps({"run_config": cfg, "report": report}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    size_gb = sum(f.stat().st_size for f in out.glob("*.safetensors")) / 1e9
    print(f"merged checkpoint: {out}  ({size_gb:.2f} GB of weights)")

    if args.push_to_hub:
        model.push_to_hub(args.push_to_hub, private=True, safe_serialization=True)
        processor.push_to_hub(args.push_to_hub, private=True)
        model.generation_config.push_to_hub(args.push_to_hub)
        print(f"pushed to https://huggingface.co/{args.push_to_hub} (private)")


if __name__ == "__main__":
    main()
