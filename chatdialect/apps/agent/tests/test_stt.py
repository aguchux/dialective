from unittest.mock import MagicMock, patch

from providers.stt import WhisperLocalProvider


def _make_provider_with_mocked_pipeline(pipeline_return_value):
    """
    `transformers` exposes `pipeline` via a lazy-module __getattr__ that
    caches the resolved reference onto transformers.__dict__ the first
    time it's accessed in this process. Before that first resolution,
    patch("transformers.pipeline", ...) does nothing (a fresh `from
    transformers import pipeline` re-triggers lazy resolution and returns
    the real function -- confirmed while writing this test: it silently
    downloaded a real model). After the first resolution, patching
    transformers.pipelines.pipeline (the defining module) no longer works,
    because the now-cached transformers.pipeline attribute is what gets
    imported instead. Patching both simultaneously is the only
    process-order-independent fix.
    """
    mock_pipeline_instance = MagicMock(return_value=pipeline_return_value)
    with (
        patch("transformers.pipelines.pipeline", return_value=mock_pipeline_instance),
        patch("transformers.pipeline", return_value=mock_pipeline_instance, create=True),
    ):
        provider = WhisperLocalProvider("openai/whisper-small")
    return provider, mock_pipeline_instance


async def test_transcribe_strips_and_returns_text():
    provider, mock_pipeline_instance = _make_provider_with_mocked_pipeline({"text": "  hello world  "})

    result = await provider.transcribe("/tmp/fake.wav")

    assert result == "hello world"
    mock_pipeline_instance.assert_called_once_with("/tmp/fake.wav")


async def test_transcribe_handles_missing_text_key():
    provider, _ = _make_provider_with_mocked_pipeline({})

    result = await provider.transcribe("/tmp/fake.wav")

    assert result == ""
