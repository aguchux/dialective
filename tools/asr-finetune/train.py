"""Fine-tune a Whisper checkpoint on one dialect's Dialect Library recordings.

Built for a small GPU (the 2 GB Quadro P600 box) but runs anywhere torch
does, including CPU for a smoke test:

  * LoRA by default: the base weights stay frozen and only small adapter
    matrices train, so optimizer state is megabytes instead of gigabytes.
    whisper-small (~244M params, every NCAIR1 checkpoint) fits in 2 GB this
    way at --batch-size 1-2. A FULL fine-tune only fits for tiny/base.
  * fp32 throughout: Pascal cards (P600 = GP107) run fp16 at a small fraction
    of their fp32 rate and have no bf16, so mixed precision would be slower.
  * Gradient checkpointing, and --freeze-encoder to skip encoder gradients
    entirely (much faster; good when the base already knows the language).

Order of work, every run:
  1. Baseline: score the UNTOUCHED base checkpoint on dev and test. This is
     the bar -- the dev score is the initial "best", so a run that never
     beats production never writes a best/ directory at all.
  2. Train, scoring dev every --eval-every steps; keep the best by dev WER.
  3. Score best/ on test and write report.json with both numbers side by side.

Resumable: re-run the same command with --resume after a crash or a Windows
Update reboot; it continues from <run>/last/.
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import random
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset, Subset

from common import (
    SAMPLE_RATE,
    WHISPER_SIZE_BY_D_MODEL,
    configure_language,
    finalize_generation_config,
    load_audio,
    load_split,
    registry_checkpoint,
    score,
    transcribe_rows,
    write_jsonl,
)


# --------------------------------------------------------------------------
# data
# --------------------------------------------------------------------------


class ClipDataset(Dataset):
    def __init__(
        self,
        rows,
        data_dir: Path,
        processor,
        prefix_ids: list[int],
        max_label_tokens: int,
    ):
        self.rows = rows
        self.data_dir = data_dir
        self.fe = processor.feature_extractor
        self.tok = processor.tokenizer
        self.prefix = prefix_ids
        self.sot = self.tok.convert_tokens_to_ids("<|startoftranscript|>")
        self.eot = self.tok.convert_tokens_to_ids("<|endoftext|>")
        self.max_text = max_label_tokens - len(prefix_ids) - 2

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        row = self.rows[i]
        audio = load_audio(self.data_dir / row["audio"])
        feats = self.fe(
            audio, sampling_rate=SAMPLE_RATE, return_tensors="np"
        ).input_features[0]
        text_ids = self.tok(row["text"], add_special_tokens=False).input_ids[
            : self.max_text
        ]
        # decoder input:  <sot> <prefix...> t1 .. tn
        # target:         <prefix...> t1 .. tn <eot>   (prefix positions masked:
        # generation forces them, so there is nothing to learn there)
        decoder_input = [self.sot] + self.prefix + text_ids
        labels = [-100] * len(self.prefix) + text_ids + [self.eot]
        return feats, decoder_input, labels


class Collate:
    """A class, not a closure: Windows DataLoader workers are spawned
    processes, and collate_fn has to be picklable to reach them."""

    def __init__(self, pad_id: int):
        self.pad_id = pad_id

    def __call__(self, batch):
        feats = torch.from_numpy(np.stack([b[0] for b in batch]))
        width = max(len(b[1]) for b in batch)
        dec = torch.full((len(batch), width), self.pad_id, dtype=torch.long)
        lab = torch.full((len(batch), width), -100, dtype=torch.long)
        for i, (_, d, l) in enumerate(batch):
            dec[i, : len(d)] = torch.tensor(d)
            lab[i, : len(l)] = torch.tensor(l)
        return feats, dec, lab


# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------


def load_processor(checkpoint: str):
    from transformers import (
        WhisperFeatureExtractor,
        WhisperProcessor,
        WhisperTokenizer,
        AutoConfig,
    )

    try:
        return WhisperProcessor.from_pretrained(checkpoint)
    except OSError:
        # Some community fine-tunes ship no preprocessor_config.json (see the
        # registry notes). The feature extractor depends only on model size,
        # so borrow it from the matching openai base; the tokenizer must
        # still be the checkpoint's own.
        d_model = AutoConfig.from_pretrained(checkpoint).d_model
        base = WHISPER_SIZE_BY_D_MODEL[d_model]
        print(
            f"  {checkpoint} has no preprocessor config; using {base}'s feature extractor"
        )
        return WhisperProcessor(
            feature_extractor=WhisperFeatureExtractor.from_pretrained(base),
            tokenizer=WhisperTokenizer.from_pretrained(checkpoint),
        )


def load_base(checkpoint: str, device):
    from transformers import WhisperForConditionalGeneration

    model = WhisperForConditionalGeneration.from_pretrained(
        checkpoint, attn_implementation="sdpa"
    )
    return model.to(device)


def lora_target_regex(targets: list[str], freeze_encoder: bool) -> str:
    scope = "decoder" if freeze_encoder else "(?:encoder|decoder)"
    return rf"model\.{scope}\.layers\.\d+\.(?:\w+\.)?(?:{'|'.join(targets)})"


def build_trainable(model, args):
    if args.freeze_encoder:
        for p in model.model.encoder.parameters():
            p.requires_grad = False
    model.config.use_cache = False
    model.gradient_checkpointing_enable(
        gradient_checkpointing_kwargs={"use_reentrant": False}
    )
    if args.method == "lora":
        from peft import LoraConfig, get_peft_model

        cfg = LoraConfig(
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            target_modules=lora_target_regex(
                args.lora_targets.split(","), args.freeze_encoder
            ),
            bias="none",
        )
        model = get_peft_model(model, cfg)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"  trainable params: {trainable / 1e6:.2f}M of {total / 1e6:.1f}M")
    return model


def load_tuned(run: Path, which: str, base: str, device, language: str | None):
    """Rebuild the model a checkpoint dir holds, ready for inference."""
    ckpt = run / which
    processor = load_processor(base)
    if (ckpt / "adapter_config.json").exists():
        from peft import PeftModel

        model = load_base(base, device)
        configure_language(model, processor, language)
        model = PeftModel.from_pretrained(model, str(ckpt)).merge_and_unload()
    else:
        from transformers import WhisperForConditionalGeneration

        model = WhisperForConditionalGeneration.from_pretrained(
            str(ckpt), attn_implementation="sdpa"
        ).to(device)
        configure_language(model, processor, language)
    model.config.use_cache = True
    return model, processor


def release_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


# --------------------------------------------------------------------------
# checkpoints
# --------------------------------------------------------------------------


def save_model_dir(model, processor, path: Path):
    tmp = path.with_name(path.name + ".tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    model.save_pretrained(str(tmp))
    processor.save_pretrained(str(tmp))
    base_model = model.get_base_model() if hasattr(model, "get_base_model") else model
    base_model.generation_config.save_pretrained(str(tmp))
    if path.exists():
        shutil.rmtree(path)
    tmp.rename(path)


def save_last(model, processor, optimizer, scheduler, state, run: Path):
    save_model_dir(model, processor, run / "last")
    torch.save(
        {
            "optimizer": optimizer.state_dict(),
            "scheduler": scheduler.state_dict(),
            "state": state,
            "torch_rng": torch.get_rng_state(),
            "py_rng": random.getstate(),
            "np_rng": np.random.get_state(),
        },
        run / "last" / "trainer_state.pt",
    )


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def is_better(dev: dict, state: dict) -> bool:
    """Lower WER wins; equal WER falls back to CER. Most labels are single
    words, so per-clip WER is all-or-nothing and a model can get much closer
    to the right spelling without WER moving at all."""
    if dev["wer"] is None:
        return False
    if state["best_wer"] is None or dev["wer"] < state["best_wer"]:
        return True
    return dev["wer"] == state["best_wer"] and dev["cer"] < (
        state.get("best_cer") or float("inf")
    )


def evaluate_split(model, processor, rows, data_dir, device, batch_size):
    hyps = transcribe_rows(
        model, processor, rows, data_dir, device, batch_size=batch_size
    )
    return score([r["text"] for r in rows], hyps), hyps


def parse_args():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--dialect", required=True)
    p.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="dir with manifest.jsonl + audio/ (from fetch_audio.py)",
    )
    p.add_argument("--run-dir", type=Path, help="default: runs/<dialect>-<method>")
    p.add_argument(
        "--base",
        help="HF checkpoint to start from; default: this dialect's checkpoint in models/asr-registry.yaml",
    )
    p.add_argument(
        "--language",
        help="Whisper language token to force (required when the base does not pin one)",
    )
    p.add_argument("--method", choices=["lora", "full"], default="lora")
    p.add_argument(
        "--freeze-encoder",
        action="store_true",
        help="train the decoder only: faster, less memory",
    )
    p.add_argument("--epochs", type=float, default=3.0)
    p.add_argument(
        "--max-steps", type=int, default=0, help="overrides --epochs when set"
    )
    p.add_argument("--batch-size", type=int, default=2)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--lr", type=float, help="default 5e-4 for lora, 1e-5 for full")
    p.add_argument("--warmup-steps", type=int, default=50)
    p.add_argument("--lora-r", type=int, default=32)
    p.add_argument("--lora-alpha", type=int, default=64)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument(
        "--lora-targets",
        default="q_proj,k_proj,v_proj,out_proj",
        help="add fc1,fc2 for a language the base has never seen",
    )
    p.add_argument("--eval-every", type=int, default=200)
    p.add_argument("--save-every", type=int, default=100)
    p.add_argument(
        "--dev-limit",
        type=int,
        default=300,
        help="dev clips scored at each eval (all of test is always scored)",
    )
    p.add_argument("--eval-batch-size", type=int, default=8)
    p.add_argument("--max-label-tokens", type=int, default=128)
    p.add_argument("--num-workers", type=int, default=2)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--resume", action="store_true")
    p.add_argument(
        "--force",
        action="store_true",
        help="skip the model-too-large-for-this-GPU check",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    args.lr = args.lr or (5e-4 if args.method == "lora" else 1e-5)
    run = args.run_dir or Path("runs") / f"{args.dialect}-{args.method}"
    run.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    cfg_path = run / "run_config.json"
    if args.resume:
        if not (run / "last" / "trainer_state.pt").exists():
            raise SystemExit(f"--resume given but {run / 'last'} has no checkpoint")
        saved = json.loads(cfg_path.read_text(encoding="utf-8"))
        args.base, args.language = saved["base"], saved["language"]
    base = args.base or registry_checkpoint(args.dialect)
    if not base:
        raise SystemExit(
            f"{args.dialect} has no whisper checkpoint in models/asr-registry.yaml -- pass --base "
            "(e.g. openai/whisper-small) and --language"
        )

    if device.type == "cuda":
        props = torch.cuda.get_device_properties(0)
        print(
            f"GPU: {props.name}, {props.total_memory / 2**30:.1f} GiB, compute {props.major}.{props.minor}"
        )
    else:
        print(
            "GPU: none -- running on CPU (fine for a smoke test, far too slow for a real run)"
        )

    train_rows = load_split(args.data_dir, "train")
    dev_rows = sorted(load_split(args.data_dir, "dev"), key=lambda r: r["id"])[
        : args.dev_limit
    ]
    test_rows = load_split(args.data_dir, "test")
    print(
        f"data: train {len(train_rows)}, dev {len(dev_rows)} (scored), test {len(test_rows)}"
    )
    if not train_rows or not dev_rows or not test_rows:
        raise SystemExit(
            "every split needs clips -- re-export with a larger --test-pct/--dev-pct or more data"
        )

    processor = load_processor(base)
    model = load_base(base, device)
    prefix = configure_language(model, processor, args.language)
    finalize_generation_config(model, processor)
    n_params = sum(p.numel() for p in model.parameters())
    if device.type == "cuda" and not args.force:
        gib = torch.cuda.get_device_properties(0).total_memory / 2**30
        if n_params > 400e6 and gib < 6:
            raise SystemExit(
                f"{base} has {n_params / 1e6:.0f}M params (whisper-medium or larger); its fp32 weights alone "
                f"exceed this {gib:.1f} GiB GPU. Use a whisper-small base, or --force to try anyway."
            )
        if args.method == "full" and n_params > 100e6 and gib < 6:
            raise SystemExit(
                f"A full fine-tune of {n_params / 1e6:.0f}M params will not fit in {gib:.1f} GiB; use --method lora"
            )
    print(f"base: {base} ({n_params / 1e6:.0f}M params), decoder prefix ids: {prefix}")

    if not args.resume:
        cfg_path.write_text(
            json.dumps(
                {
                    "dialect": args.dialect,
                    "base": base,
                    "language": args.language,
                    "prefix_ids": prefix,
                    "method": args.method,
                    "freeze_encoder": args.freeze_encoder,
                    "lora": {
                        "r": args.lora_r,
                        "alpha": args.lora_alpha,
                        "dropout": args.lora_dropout,
                        "targets": args.lora_targets,
                    }
                    if args.method == "lora"
                    else None,
                    "lr": args.lr,
                    "batch_size": args.batch_size,
                    "grad_accum": args.grad_accum,
                    "data_dir": str(args.data_dir),
                    "seed": args.seed,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    # ---- 1. baseline -----------------------------------------------------
    state = {
        "step": 0,
        "micro": 0,
        "best_wer": None,
        "best_step": None,
        "baseline": None,
        "history": [],
    }
    resume_blob = None
    if args.resume:
        resume_blob = torch.load(run / "last" / "trainer_state.pt", weights_only=False)
        state = resume_blob["state"]
    if state["baseline"] is None:
        print("scoring the base checkpoint (this is the number to beat)...")
        model.config.use_cache = True
        dev_score, _ = evaluate_split(
            model, processor, dev_rows, args.data_dir, device, args.eval_batch_size
        )
        test_score, test_hyps = evaluate_split(
            model, processor, test_rows, args.data_dir, device, args.eval_batch_size
        )
        state["baseline"] = {"dev": dev_score, "test": test_score}
        state["best_wer"], state["best_cer"] = dev_score["wer"], dev_score["cer"]
        write_jsonl(
            run / "test_predictions_baseline.jsonl",
            [
                {"id": r["id"], "ref": r["text"], "hyp": h}
                for r, h in zip(test_rows, test_hyps)
            ],
        )
        print(f"  baseline dev  {dev_score}\n  baseline test {test_score}")

    # ---- 2. train --------------------------------------------------------
    model = build_trainable(model, args)
    if args.resume:
        last = run / "last"
        if args.method == "lora":
            from peft import set_peft_model_state_dict
            from safetensors.torch import load_file

            set_peft_model_state_dict(
                model, load_file(str(last / "adapter_model.safetensors"))
            )
        else:
            from transformers import WhisperForConditionalGeneration

            model.load_state_dict(
                WhisperForConditionalGeneration.from_pretrained(str(last)).state_dict()
            )

    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(
        params, lr=args.lr, weight_decay=0.0 if args.method == "lora" else 0.01
    )
    micro_per_epoch = math.ceil(len(train_rows) / args.batch_size)
    total_steps = args.max_steps or max(
        1, math.ceil(micro_per_epoch * args.epochs / args.grad_accum)
    )
    from transformers import get_linear_schedule_with_warmup

    scheduler = get_linear_schedule_with_warmup(
        optimizer, min(args.warmup_steps, total_steps // 10), total_steps
    )
    if resume_blob:
        optimizer.load_state_dict(resume_blob["optimizer"])
        scheduler.load_state_dict(resume_blob["scheduler"])
        torch.set_rng_state(resume_blob["torch_rng"])
        random.setstate(resume_blob["py_rng"])
        np.random.set_state(resume_blob["np_rng"])
        print(f"resumed at step {state['step']}/{total_steps}")

    dataset = ClipDataset(
        train_rows, args.data_dir, processor, prefix, args.max_label_tokens
    )
    collate = Collate(dataset.eot)
    loader = None
    print(
        f"training: {total_steps} optimizer steps, effective batch {args.batch_size * args.grad_accum}, lr {args.lr}"
    )

    model.train()
    t0, seen, running, logged = time.time(), 0, 0.0, 0
    done = state["step"] >= total_steps
    while not done:
        epoch, offset = divmod(state["micro"], micro_per_epoch)
        order = torch.randperm(
            len(dataset), generator=torch.Generator().manual_seed(args.seed + epoch)
        ).tolist()
        loader = DataLoader(
            Subset(dataset, order[offset * args.batch_size :]),
            batch_size=args.batch_size,
            shuffle=False,
            collate_fn=collate,
            num_workers=args.num_workers,
        )
        for feats, dec, lab in loader:
            try:
                out = model(
                    input_features=feats.to(device),
                    decoder_input_ids=dec.to(device),
                    labels=lab.to(device),
                )
                (out.loss / args.grad_accum).backward()
            except torch.cuda.OutOfMemoryError:
                print(
                    "\nCUDA out of memory. Try, in order: --batch-size 1 (raise --grad-accum to keep the effective "
                    "batch), --freeze-encoder, a smaller --lora-r. Close anything else using the GPU (a monitor "
                    "plugged into the P600 costs VRAM -- use Remote Desktop instead). Resume with --resume.",
                    file=sys.stderr,
                )
                sys.exit(2)
            running += out.loss.item()
            logged += 1
            seen += feats.shape[0]
            state["micro"] += 1
            if state["micro"] % args.grad_accum:
                continue

            torch.nn.utils.clip_grad_norm_(params, 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad(set_to_none=True)
            state["step"] += 1
            step = state["step"]

            if step % 10 == 0 or step == total_steps:
                rate = seen / (time.time() - t0)
                eta_h = (
                    (total_steps - step)
                    * args.grad_accum
                    * args.batch_size
                    / max(rate, 1e-9)
                    / 3600
                )
                mem = (
                    f", gpu peak {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB"
                    if device.type == "cuda"
                    else ""
                )
                print(
                    f"step {step}/{total_steps}  loss {running / max(logged, 1):.4f}  {rate:.2f} clips/s  eta {eta_h:.1f} h{mem}",
                    flush=True,
                )
                running, logged = 0.0, 0

            if step % args.eval_every == 0 or step == total_steps:
                model.config.use_cache = True
                dev_score, _ = evaluate_split(
                    model,
                    processor,
                    dev_rows,
                    args.data_dir,
                    device,
                    args.eval_batch_size,
                )
                model.config.use_cache = False
                model.train()
                state["history"].append({"step": step, "dev": dev_score})
                better = is_better(dev_score, state)
                print(
                    f"  dev @ {step}: {dev_score}{'  <- new best' if better else ''}",
                    flush=True,
                )
                if better:
                    state["best_wer"], state["best_cer"], state["best_step"] = (
                        dev_score["wer"],
                        dev_score["cer"],
                        step,
                    )
                    save_model_dir(model, processor, run / "best")

            if step % args.save_every == 0 or step == total_steps:
                save_last(model, processor, optimizer, scheduler, state, run)

            if step >= total_steps:
                done = True
                break

    # ---- 3. final test ---------------------------------------------------
    report = {
        "dialect": args.dialect,
        "base": base,
        "method": args.method,
        "language": args.language,
        "train_clips": len(train_rows),
        "steps": state["step"],
        "baseline": state["baseline"],
        "best_step": state["best_step"],
        "dev_history": state["history"],
    }
    # The 2 GB card cannot hold the training model and a reloaded one at once.
    del model, optimizer, scheduler, params, loader
    release_memory()
    if state["best_step"] is None:
        report["tuned"] = None
        report["verdict"] = (
            "NO IMPROVEMENT -- the fine-tune never beat the base checkpoint on dev. Do not deploy."
        )
    else:
        tuned, proc = load_tuned(run, "best", base, device, args.language)
        test_score, hyps = evaluate_split(
            tuned, proc, test_rows, args.data_dir, device, args.eval_batch_size
        )
        write_jsonl(
            run / "test_predictions_tuned.jsonl",
            [
                {"id": r["id"], "ref": r["text"], "hyp": h}
                for r, h in zip(test_rows, hyps)
            ],
        )
        report["tuned"] = {"test": test_score}
        b, t = state["baseline"]["test"], test_score
        wer_down = (
            t["wer"] is not None
            and b["wer"] is not None
            and t["wer"] < b["wer"] - 0.005
        )
        cer_down = (
            t["wer"] == b["wer"]
            and t["cer"] is not None
            and t["cer"] < b["cer"] - 0.005
        )
        summary = f"test WER {b['wer']} -> {t['wer']}, CER {b['cer']} -> {t['cer']}"
        if wer_down or cer_down:
            report["verdict"] = f"IMPROVED -- {summary}. Candidate for merge.py."
        else:
            report["verdict"] = (
                f"NOT BETTER ON TEST -- {summary}. Better on dev only; do not deploy."
            )
    (run / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\n{report['verdict']}\nreport: {run / 'report.json'}")


if __name__ == "__main__":
    main()
