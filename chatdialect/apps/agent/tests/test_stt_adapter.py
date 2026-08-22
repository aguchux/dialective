from unittest.mock import AsyncMock

from livekit import rtc
from livekit.agents import stt

from providers.stt_adapter import WhisperSTT


def _silence_buffer(
    duration_s: float = 0.5, sample_rate: int = 16000
) -> rtc.AudioFrame:
    num_samples = int(duration_s * sample_rate)
    return rtc.AudioFrame(
        data=b"\x00\x00" * num_samples,
        sample_rate=sample_rate,
        num_channels=1,
        samples_per_channel=num_samples,
    )


async def test_recognize_returns_final_transcript():
    mock_provider = AsyncMock()
    mock_provider.transcribe.return_value = "hello world"
    adapter = WhisperSTT(mock_provider)

    event = await adapter.recognize(buffer=[_silence_buffer()])

    assert event.type == stt.SpeechEventType.FINAL_TRANSCRIPT
    assert event.alternatives[0].text == "hello world"
    mock_provider.transcribe.assert_called_once()


async def test_capabilities_are_non_streaming():
    mock_provider = AsyncMock()
    adapter = WhisperSTT(mock_provider)

    assert adapter.capabilities.streaming is False
    assert adapter.capabilities.interim_results is False
