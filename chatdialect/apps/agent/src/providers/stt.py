from abc import ABC, abstractmethod

# CPU-only inference, matching this repo's existing GPU boundary (AGENTS.md
# "MMS-TTS boundary" applies the same reasoning here, and
# services/whisper-worker/worker.py's own _DEVICE = "cpu" constant is the
# direct precedent). Do not move this to CUDA.
_DEVICE = "cpu"


class SpeechToTextProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_path: str) -> str:
        """Transcribes a WAV file on disk to text. Provider-neutral -- agent.py never imports a concrete provider directly."""
        raise NotImplementedError


class WhisperLocalProvider(SpeechToTextProvider):
    """
    Self-hosted STT -- same transformers.pipeline("automatic-speech-
    recognition", ...) call shape as services/whisper-worker/worker.py's
    get_pipeline, CPU-only, in-process inside the agent worker (not a
    cross-service call to whisper-worker itself, which is coupled to Redis
    Streams/Postgres job plumbing ChatDialect doesn't need -- only the
    inference approach is reused). checkpoint is configurable so this can
    directly exercise whichever Whisper checkpoint Dialect Library is
    currently validating (open openai/whisper-small by default, or an
    NCAIR1 dialect fine-tune).

    Model loads once at construction (agent-worker startup), not per-call --
    mirrors whisper-worker's/prompt-audio-service's own _model_cache
    pattern. First-request latency from this cold load is an accepted
    tradeoff of self-hosting versus a hosted API.
    """

    def __init__(self, checkpoint: str) -> None:
        from transformers import pipeline

        self._pipeline = pipeline(
            task="automatic-speech-recognition",
            model=checkpoint,
            device=_DEVICE,
        )

    async def transcribe(self, audio_path: str) -> str:
        result = self._pipeline(audio_path)
        return result.get("text", "").strip()
