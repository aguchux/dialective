"""
Wraps MmsTtsProvider to satisfy livekit.agents.tts.TTS's plugin protocol.
Pattern follows livekit-plugins-openai's tts.py ChunkedStream._run --
MmsTtsProvider.synthesize() produces one complete WAV at a time (no
incremental streaming from the model), so this pushes the whole payload to
AudioEmitter in one call, same as OpenAI's AudioChunkedStream.
"""

from livekit.agents import APIConnectionError, APIConnectOptions, tts
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

from .tts import MmsTtsProvider


class MmsTTS(tts.TTS):
    def __init__(self, provider: MmsTtsProvider, sample_rate: int) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=1,
        )
        self._provider = provider

    @property
    def model(self) -> str:
        return "mms-tts-local"

    @property
    def provider(self) -> str:
        return "chatdialect-self-hosted"

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return _MmsChunkedStream(tts=self, input_text=text, conn_options=conn_options)


class _MmsChunkedStream(tts.ChunkedStream):
    def __init__(
        self, *, tts: MmsTTS, input_text: str, conn_options: APIConnectOptions
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._mms_tts: MmsTTS = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        try:
            result = await self._mms_tts._provider.synthesize(self.input_text)
        except Exception as e:
            raise APIConnectionError() from e

        output_emitter.initialize(
            request_id="",
            sample_rate=result.sample_rate,
            num_channels=1,
            # audio/pcm is the one mime_type AudioEmitter decodes without an
            # external decoder -- see SpeechSynthesisResult.pcm_s16le's
            # docstring for why the WAV-wrapped `audio` field can't be used
            # here directly.
            mime_type="audio/pcm",
        )
        output_emitter.push(result.pcm_s16le)
        output_emitter.flush()
