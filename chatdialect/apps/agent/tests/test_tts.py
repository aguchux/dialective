from unittest.mock import MagicMock, patch

import numpy as np

from providers.tts import MmsTtsProvider


def _make_mock_model(sample_rate: int, waveform_len: int):
    mock_model = MagicMock()
    mock_model.config.sampling_rate = sample_rate
    mock_output = MagicMock()
    mock_output.waveform.squeeze.return_value.numpy.return_value = np.zeros(
        waveform_len, dtype=np.float32
    )
    mock_model.return_value = mock_output
    mock_model.to.return_value = mock_model
    return mock_model


async def test_synthesize_returns_expected_duration_and_sample_rate():
    mock_model = _make_mock_model(sample_rate=16000, waveform_len=32000)
    mock_tokenizer = MagicMock()
    mock_tokenizer.return_value = {"input_ids": MagicMock()}

    with (
        patch("transformers.VitsModel.from_pretrained", return_value=mock_model),
        patch(
            "transformers.VitsTokenizer.from_pretrained", return_value=mock_tokenizer
        ),
        patch("torch.no_grad"),
    ):
        provider = MmsTtsProvider("facebook/mms-tts-eng")
        result = await provider.synthesize("hello")

    assert result.sample_rate == 16000
    assert result.duration == 2.0  # 32000 samples / 16000 Hz
    assert isinstance(result.audio, bytes)
    assert len(result.audio) > 0


async def test_synthesize_leaves_viseme_and_timing_fields_none():
    # Doc §11's Tier-1 lip-sync fallback: MMS-TTS doesn't expose viseme/word/
    # phoneme timing, so these must stay None (the agent drives jaw/mouth
    # from audio amplitude instead).
    mock_model = _make_mock_model(sample_rate=16000, waveform_len=16000)
    mock_tokenizer = MagicMock()
    mock_tokenizer.return_value = {"input_ids": MagicMock()}

    with (
        patch("transformers.VitsModel.from_pretrained", return_value=mock_model),
        patch(
            "transformers.VitsTokenizer.from_pretrained", return_value=mock_tokenizer
        ),
        patch("torch.no_grad"),
    ):
        provider = MmsTtsProvider("facebook/mms-tts-eng")
        result = await provider.synthesize("hello")

    assert result.visemes is None
    assert result.word_timings is None
    assert result.phoneme_timings is None
