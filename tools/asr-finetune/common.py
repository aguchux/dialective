"""Shared helpers for the offline ASR fine-tuning tool.

Nothing here is imported by any service. The registry is read from the same
models/asr-registry.yaml the api and whisper-worker use, so a fine-tune always
starts from the checkpoint production is actually serving for that dialect.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
ASR_REGISTRY_PATH = REPO_ROOT / "models" / "asr-registry.yaml"

SAMPLE_RATE = 16000
# Whisper's encoder sees a fixed 30 s window, so anything longer cannot be
# learned from as one example. Anything shorter than this is almost always a
# mis-tap, not a word.
MIN_CLIP_S = 0.2
MAX_CLIP_S = 30.0

# Same table as whisper-worker/worker.py's _WHISPER_SIZE_BY_D_MODEL: used to
# borrow alignment_heads from the matching base model when a checkpoint's
# generation_config omits them, so word timestamps keep working in production.
WHISPER_SIZE_BY_D_MODEL = {
    384: "openai/whisper-tiny",
    512: "openai/whisper-base",
    768: "openai/whisper-small",
    1024: "openai/whisper-medium",
    1280: "openai/whisper-large-v3",
}


def load_registry(path: Path = ASR_REGISTRY_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def registry_checkpoint(dialect_tag: str) -> str | None:
    entry = load_registry().get(dialect_tag)
    if entry and entry.get("engine") == "whisper":
        return entry.get("checkpoint")
    return None


def speaker_hash(user_id: str | None) -> str:
    """Pseudonymous, stable speaker id. Stable so re-exports keep every
    speaker in the same split; never the raw userId, so a dataset copied to
    the GPU box does not carry account identifiers."""
    return hashlib.sha256(f"dl-asr-finetune:{user_id or 'anon'}".encode()).hexdigest()[
        :16
    ]


def split_for_speaker(spk: str, test_pct: int, dev_pct: int) -> str:
    """Split by SPEAKER, not by clip: a test set full of voices the model
    already trained on measures memorization of those voices, not how it will
    do on the next trainer who signs up."""
    bucket = int(spk[:8], 16) % 100
    if bucket < test_pct:
        return "test"
    if bucket < test_pct + dev_pct:
        return "dev"
    return "train"


def clean_label(text: str) -> str:
    """Training target: the trainer's text with whitespace tidied. Case and
    diacritics are kept -- they carry meaning in tonal orthographies."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip()


def normalize_for_scoring(text: str) -> str:
    """Scoring-only normalization: case-folded, punctuation removed, combining
    marks (tone/diacritics) KEPT. Applied to reference and hypothesis alike."""
    text = unicodedata.normalize("NFC", text or "").casefold()
    text = "".join(
        " " if unicodedata.category(ch).startswith("P") else ch for ch in text
    )
    return re.sub(r"\s+", " ", text).strip()


def read_jsonl(path: Path) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    tmp.replace(path)


def load_split(data_dir: Path, split: str) -> list[dict]:
    manifest = data_dir / "manifest.jsonl"
    if not manifest.exists():
        raise SystemExit(f"{manifest} not found -- run fetch_audio.py first")
    return [r for r in read_jsonl(manifest) if r["split"] == split]


# --------------------------------------------------------------------------
# Model helpers (torch/transformers imported lazily so export_manifest.py and
# fetch_audio.py run without them).
# --------------------------------------------------------------------------


def configure_language(model, processor, language: str | None) -> list[int]:
    """Resolve the decoder prefix (the tokens after <|startoftranscript|>) the
    model must be trained on, and make generation use the same one.

    Priority: an explicit --language, then whatever the checkpoint's own
    generation config already forces. Training on one prefix and serving with
    another is the classic way a fine-tune "works in the notebook" and then
    decodes garbage in production, so this refuses to guess.
    """
    tok = processor.tokenizer
    gen = model.generation_config

    if language:
        tok.set_prefix_tokens(
            language=language, task="transcribe", predict_timestamps=False
        )
        gen.language = language
        gen.task = "transcribe"
        gen.forced_decoder_ids = None
        model.config.forced_decoder_ids = None
        return list(tok.prefix_tokens[1:])

    if getattr(gen, "language", None):
        tok.set_prefix_tokens(
            language=gen.language,
            task=getattr(gen, "task", None) or "transcribe",
            predict_timestamps=False,
        )
        return list(tok.prefix_tokens[1:])

    forced = getattr(gen, "forced_decoder_ids", None) or getattr(
        model.config, "forced_decoder_ids", None
    )
    if forced and all(tok_id is not None for _, tok_id in forced):
        return [tok_id for _, tok_id in sorted(forced)]

    if getattr(gen, "is_multilingual", True) is False:
        tok.set_prefix_tokens(predict_timestamps=False)
        return list(tok.prefix_tokens[1:])

    raise SystemExit(
        "This checkpoint does not pin a language, so production would auto-detect one per clip and the "
        "fine-tune's prefix could not be matched. Pass --language (a Whisper language code such as yo, ha, "
        "sw). For a language Whisper has no token for (ibb, ig, rw...), pick the closest one and keep "
        "using the same value for every later run of that dialect."
    )


def finalize_generation_config(model, processor) -> None:
    """Fill the same generation_config gaps whisper-worker patches at load
    time, so the saved checkpoint does not depend on that patching."""
    gen = model.generation_config
    if getattr(gen, "no_timestamps_token_id", None) is None:
        gen.no_timestamps_token_id = processor.tokenizer.convert_tokens_to_ids(
            "<|notimestamps|>"
        )
    if getattr(gen, "alignment_heads", None) is None:
        base = WHISPER_SIZE_BY_D_MODEL.get(model.config.d_model)
        if base:
            from transformers import GenerationConfig

            gen.alignment_heads = GenerationConfig.from_pretrained(base).alignment_heads


def load_audio(path: Path):
    import numpy as np
    import soundfile as sf

    audio, sr = sf.read(str(path), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != SAMPLE_RATE:
        raise ValueError(
            f"{path} is {sr} Hz, expected {SAMPLE_RATE} -- re-run fetch_audio.py"
        )
    return np.ascontiguousarray(audio)


def transcribe_rows(
    model,
    processor,
    rows,
    data_dir: Path,
    device,
    batch_size: int = 8,
    max_new_tokens: int = 128,
):
    """Greedy-decode rows with the model's own generation config -- the same
    decode settings whisper-worker's pipeline uses (minus word timestamps,
    which do not change the text)."""
    import torch

    hyps: list[str] = []
    model.eval()
    dtype = next(model.parameters()).dtype
    with torch.no_grad():
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            audios = [load_audio(data_dir / r["audio"]) for r in batch]
            feats = processor.feature_extractor(
                audios, sampling_rate=SAMPLE_RATE, return_tensors="pt"
            ).input_features
            out = model.generate(
                input_features=feats.to(device, dtype=dtype),
                generation_config=model.generation_config,
                max_new_tokens=max_new_tokens,
            )
            hyps.extend(processor.tokenizer.batch_decode(out, skip_special_tokens=True))
    return [h.strip() for h in hyps]


def score(refs: list[str], hyps: list[str]) -> dict:
    import jiwer

    pairs = [
        (normalize_for_scoring(r), normalize_for_scoring(h)) for r, h in zip(refs, hyps)
    ]
    pairs = [(r, h) for r, h in pairs if r]
    if not pairs:
        return {"n": 0, "wer": None, "cer": None, "exact_match": None}
    r, h = zip(*pairs)
    # jiwer rejects empty hypotheses inside a list; a single space scores as
    # all-deletions, which is what an empty transcript is.
    h = [x or " " for x in h]
    return {
        "n": len(r),
        "wer": round(jiwer.wer(list(r), h), 4),
        "cer": round(jiwer.cer(list(r), h), 4),
        "exact_match": round(sum(a == b.strip() for a, b in zip(r, h)) / len(r), 4),
    }
