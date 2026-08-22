"""
Wraps OpenAIGPTProvider to satisfy livekit.agents.llm.LLM's plugin
protocol. OpenAIGPTProvider.respond() returns one complete
{text, emotion} response per turn rather than a token stream, so this
emits it as a single ChatChunk instead of incrementally -- AgentSession
still works correctly with a single-chunk "stream" (this is the same
shape a non-streaming provider would produce).

The validated emotion tag (doc SS12/SS14) rides in ChoiceDelta.extra rather
than the plain text content, so it survives without polluting what's
spoken/transcribed. Phase 3/5 (avatar wiring, doc SS22/SS24) reads it back
off the conversation item; nothing consumes it yet since there's no
avatar until Phase 2.
"""

from dataclasses import asdict

from livekit.agents import APIConnectionError, ChatContext, llm
from livekit.agents.llm import ChatChunk, ChoiceDelta
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN, NotGivenOr
from livekit.agents.utils import shortuuid

from .llm import OpenAIGPTProvider


class ChatDialectLLM(llm.LLM):
    def __init__(self, provider: OpenAIGPTProvider) -> None:
        super().__init__()
        self._provider = provider

    @property
    def model(self) -> str:
        return "chatdialect-llm"

    @property
    def provider(self) -> str:
        return "chatdialect-openai"

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options=DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[llm.ToolChoice] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict] = NOT_GIVEN,
    ) -> "_ChatDialectLLMStream":
        return _ChatDialectLLMStream(
            self,
            provider=self._provider,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )


class _ChatDialectLLMStream(llm.LLMStream):
    def __init__(
        self,
        llm_instance: ChatDialectLLM,
        *,
        provider: OpenAIGPTProvider,
        chat_ctx: ChatContext,
        tools: list[llm.Tool],
        conn_options,
    ) -> None:
        super().__init__(
            llm_instance, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options
        )
        self._provider = provider

    async def _run(self) -> None:
        history, _ = self._chat_ctx.to_provider_format("openai")
        # the last user message is the current turn; everything before it is
        # prior-turn context -- matches OpenAIGPTProvider.respond()'s own
        # (transcript, history) split.
        transcript = ""
        prior_history = history
        if history and history[-1].get("role") == "user":
            transcript = history[-1].get("content", "")
            prior_history = history[:-1]

        try:
            response = await self._provider.respond(transcript, prior_history)
        except Exception as e:
            raise APIConnectionError() from e

        self._event_ch.send_nowait(
            ChatChunk(
                id=shortuuid("chatdialect_"),
                delta=ChoiceDelta(
                    role="assistant",
                    content=response.text,
                    extra={"emotion": asdict(response.emotion)},
                ),
            )
        )
