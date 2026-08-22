from unittest.mock import AsyncMock

from providers.tts import SpeechSynthesisResult
from providers.tts_adapter import MmsTTS


async def test_synthesize_pushes_audio_to_emitter():
    mock_provider = AsyncMock()
    mock_provider.synthesize.return_value = SpeechSynthesisResult(
        audio=b"\x00\x01\x02\x03",
        duration=1.0,
        sample_rate=16000,
        pcm_s16le=b"\x00\x00" * 16000,
    )
    adapter = MmsTTS(mock_provider, sample_rate=16000)

    stream = adapter.synthesize("hello")
    frames = [frame async for frame in stream]

    assert len(frames) > 0
    mock_provider.synthesize.assert_called_once_with("hello")
    await stream.aclose()


async def test_capabilities_are_non_streaming():
    mock_provider = AsyncMock()
    adapter = MmsTTS(mock_provider, sample_rate=16000)

    assert adapter.capabilities.streaming is False
    assert adapter.sample_rate == 16000
