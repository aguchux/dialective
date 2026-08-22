"""
Wraps WhisperLocalProvider to satisfy livekit.agents.stt.STT's plugin
protocol, so AgentSession gets its built-in VAD/turn-detection/interruption
handling for free (doc SS20's Phase 1 requirement) without reimplementing
any of that by hand. Pattern follows livekit-plugins-openai's stt.py
_recognize_impl -- the only officially shipped reference for a non-
streaming STT plugin (WhisperLocalProvider.transcribe() takes a whole
utterance at once, same as OpenAI's REST transcription endpoint, so no
SpeechStream is implemented here -- AgentSession's built-in VAD buffers
audio and calls STT.recognize() once per utterance).
"""

import tempfile
from pathlib import Path

from livekit import rtc
from livekit.agents import APIConnectionError, APIConnectOptions, stt
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.agents.utils import AudioBuffer

from .stt import WhisperLocalProvider

_SAMPLE_RATE = 16000


class WhisperSTT(stt.STT):
    def __init__(self, provider: WhisperLocalProvider) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False)
        )
        self._provider = provider

    @property
    def model(self) -> str:
        return "whisper-local"

    @property
    def provider(self) -> str:
        return "chatdialect-self-hosted"

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        wav_bytes = rtc.combine_audio_frames(buffer).to_wav_bytes()
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(wav_bytes)
                tmp_path = f.name
            try:
                text = await self._provider.transcribe(tmp_path)
            finally:
                Path(tmp_path).unlink(missing_ok=True)
        except Exception as e:
            raise APIConnectionError() from e

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(text=text, language="")],
        )
