import io
from abc import ABC, abstractmethod
from dataclasses import dataclass

# CPU-only inference, matching prompt-audio-service's own _DEVICE = "cpu"
# boundary (AGENTS.md "MMS-TTS boundary"). Do not move this to CUDA.
_DEVICE = "cpu"


@dataclass
class SpeechSynthesisResult:
    """
    Doc §29's SpeechSynthesisResult -- visemes/word_timings/phoneme_timings
    are left None for MMS-TTS (it doesn't expose them, same as it would be
    None for most TTS engines). This is the expected Tier-1 lip-sync
    fallback path (doc §11): the agent drives jaw/mouth-open from `audio`'s
    amplitude instead of true viseme timing. A future TTS provider that
    does expose real viseme/timing data populates these fields without any
    change needed downstream, since AvatarController (packages/avatar-
    protocol) already consumes a normalized viseme shape either way.
    """

    audio: bytes
    duration: float
    sample_rate: int
    visemes: list[dict] | None = None
    word_timings: list[dict] | None = None
    phoneme_timings: list[dict] | None = None


class TextToSpeechProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> SpeechSynthesisResult:
        """Synthesizes text to speech. Provider-neutral -- agent.py never imports a concrete provider directly."""
        raise NotImplementedError


class MmsTtsProvider(TextToSpeechProvider):
    """
    Self-hosted TTS -- same VitsModel/VitsTokenizer approach as
    services/prompt-audio-service/worker.py's synthesize(), CPU-only,
    in-process. checkpoint is configurable (e.g. facebook/mms-tts-eng by
    default, or an African-language MMS-TTS checkpoint) so this directly
    exercises Dialect Library's actual TTS validation target.

    Model loads once at construction, mirroring prompt-audio-service's own
    _model_cache pattern -- see stt.py's WhisperLocalProvider for the same
    reasoning.
    """

    def __init__(self, checkpoint: str) -> None:
        from transformers import VitsModel, VitsTokenizer

        self._model = VitsModel.from_pretrained(checkpoint).to(_DEVICE)
        self._tokenizer = VitsTokenizer.from_pretrained(checkpoint)

    async def synthesize(self, text: str) -> SpeechSynthesisResult:
        import torch

        inputs = self._tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            output = self._model(**inputs).waveform

        waveform = output.squeeze().numpy()
        sample_rate = self._model.config.sampling_rate
        duration = len(waveform) / sample_rate

        buf = io.BytesIO()
        import scipy.io.wavfile

        scipy.io.wavfile.write(buf, rate=sample_rate, data=waveform)
        return SpeechSynthesisResult(audio=buf.getvalue(), duration=duration, sample_rate=sample_rate)
