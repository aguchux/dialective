from unittest.mock import AsyncMock

from livekit.agents import ChatContext

from providers.llm import AgentResponse, EmotionTag
from providers.llm_adapter import ChatDialectLLM


async def test_chat_emits_single_chunk_with_text_and_emotion():
    mock_provider = AsyncMock()
    mock_provider.respond.return_value = AgentResponse(
        text="Hello there", emotion=EmotionTag(type="happy", intensity=0.5)
    )
    adapter = ChatDialectLLM(mock_provider)

    ctx = ChatContext()
    ctx.add_message(role="user", content="hi")

    stream = adapter.chat(chat_ctx=ctx)
    chunks = [chunk async for chunk in stream]
    await stream.aclose()

    assert len(chunks) == 1
    assert chunks[0].delta.content == "Hello there"
    assert chunks[0].delta.extra == {"emotion": {"type": "happy", "intensity": 0.5}}
    mock_provider.respond.assert_called_once()
    call_args = mock_provider.respond.call_args
    assert call_args.args[0] == "hi"


async def test_chat_passes_prior_history_separately_from_current_transcript():
    mock_provider = AsyncMock()
    mock_provider.respond.return_value = AgentResponse(
        text="ok", emotion=EmotionTag(type="neutral", intensity=0.0)
    )
    adapter = ChatDialectLLM(mock_provider)

    ctx = ChatContext()
    ctx.add_message(role="user", content="first")
    ctx.add_message(role="assistant", content="reply")
    ctx.add_message(role="user", content="second")

    stream = adapter.chat(chat_ctx=ctx)
    [chunk async for chunk in stream]
    await stream.aclose()

    call_args = mock_provider.respond.call_args
    transcript, history = call_args.args
    assert transcript == "second"
    assert history[-1]["content"] == "reply"
