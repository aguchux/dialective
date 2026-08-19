"""
Transcription glue for the offline WAXAL benchmark. This deliberately
duplicates the small reusable pieces of services/vosk-worker/worker.py and
services/whisper-worker/worker.py rather than importing across service
boundaries -- there is no shared Python package in this repo (confirmed:
spaces.py is duplicated byte-for-byte across vosk-worker, whisper-worker,
and prompt-audio-service), and each Python service is an independent Docker
build context. This tool has no Docker build context of its own (it's
local/offline tooling, not a k8s service), so it isn't subject to that
constraint either way, but the pattern is the same: duplicate small helpers,
don't reach into another service's directory.

Reads models/asr-registry.yaml and models/registry.yaml -- the SAME
registries production uses -- since the benchmark is deliberately testing
the same engines/checkpoints production would use, not a WAXAL-specific
model list.
"""

import json
import os
import subprocess

import soundfile as sf
import yaml

REPO_ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
ASR_REGISTRY_PATH = os.path.join(REPO_ROOT, "models", "asr-registry.yaml")
VOSK_REGISTRY_PATH = os.path.join(REPO_ROOT, "models", "registry.yaml")


class UnsupportedLanguageError(Exception):
    pass


def load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def transcode_to_wav(src_path: str, dst_path: str, sr: int = 16000) -> None:
    """Identical normalization to both ASR workers -- see their worker.py docstrings."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", src_path, "-ar", str(sr), "-ac", "1", "-f", "wav", dst_path],
        check=True,
        capture_output=True,
    )


class WhisperEngine:
    """Mirrors services/whisper-worker/worker.py's get_pipeline/resolve_checkpoint."""

    def __init__(self):
        self._registry = load_yaml(ASR_REGISTRY_PATH)
        self._pipeline_cache: dict[str, object] = {}

    def supports(self, dialect_tag: str) -> bool:
        entry = self._registry.get(dialect_tag)
        return entry is not None and entry.get("engine") == "whisper"

    def _resolve_checkpoint(self, dialect_tag: str) -> str:
        entry = self._registry.get(dialect_tag)
        if entry is None or entry.get("engine") != "whisper":
            raise UnsupportedLanguageError(dialect_tag)
        return entry["checkpoint"]

    def _get_pipeline(self, dialect_tag: str):
        if dialect_tag not in self._pipeline_cache:
            from transformers import pipeline

            checkpoint = self._resolve_checkpoint(dialect_tag)
            self._pipeline_cache[dialect_tag] = pipeline(
                task="automatic-speech-recognition",
                model=checkpoint,
                device="cpu",
            )
        return self._pipeline_cache[dialect_tag]

    def transcribe(self, wav_path: str, dialect_tag: str) -> str:
        asr = self._get_pipeline(dialect_tag)
        result = asr(wav_path)
        return (result.get("text") or "").strip()


class VoskEngine:
    """Mirrors services/vosk-worker/worker.py's get_model/resolve_model_path/transcribe."""

    def __init__(self):
        self._registry = load_yaml(VOSK_REGISTRY_PATH)
        self._model_cache: dict[str, object] = {}

    def supports(self, dialect_tag: str) -> bool:
        return dialect_tag in self._registry

    def _resolve_model_path(self, dialect_tag: str) -> str:
        entry = self._registry.get(dialect_tag)
        if entry is None:
            raise UnsupportedLanguageError(dialect_tag)
        return entry["path"]

    def _get_model(self, dialect_tag: str):
        if dialect_tag not in self._model_cache:
            from vosk import Model

            self._model_cache[dialect_tag] = Model(self._resolve_model_path(dialect_tag))
        return self._model_cache[dialect_tag]

    def transcribe(self, wav_path: str, dialect_tag: str) -> str:
        from vosk import KaldiRecognizer

        model = self._get_model(dialect_tag)
        rec = KaldiRecognizer(model, 16000)
        data, _ = sf.read(wav_path, dtype="int16")
        rec.AcceptWaveform(data.tobytes())
        result = json.loads(rec.FinalResult())
        return result.get("text", "")


ENGINES = {
    "whisper": WhisperEngine,
    "vosk": VoskEngine,
}
