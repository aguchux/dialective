import logging

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    UserInputTranscribedEvent,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import ChatMessage

from config import AgentConfig
from providers.llm import OpenAIGPTProvider
from providers.llm_adapter import ChatDialectLLM
from providers.stt import WhisperLocalProvider
from providers.stt_adapter import WhisperSTT
from providers.tts import MmsTtsProvider
from providers.tts_adapter import MmsTTS

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chatdialect-agent")

_config = AgentConfig()

# Providers load once at process startup (import time, not per-job) --
# mirrors whisper-worker's/prompt-audio-service's own module-level
# _model_cache pattern (see stt.py/tts.py's docstrings). Loaded here rather
# than inside entrypoint() so the cold-load cost is paid once per worker
# process, not once per conversation.
_stt_provider = WhisperLocalProvider(_config.whisper_model_checkpoint)
_llm_provider = OpenAIGPTProvider(_config.openai_api_key)
_tts_provider = MmsTtsProvider(_config.mms_tts_checkpoint)

SYSTEM_INSTRUCTIONS = (
    "You are ChatDialect, a helpful voice assistant for Dialect Library. "
    "Keep responses concise and conversational, since they will be spoken aloud. "
    "Always reply in English, even if the transcribed input is garbled, "
    "ambiguous, or appears to mix languages -- the text-to-speech voice only "
    "supports English."
)


async def entrypoint(ctx: JobContext) -> None:
    """
    Phase 1 voice conversation vertical slice (docs/CHATDIALECT_MVP_PLAN.md
    SS20): wires the self-hosted Whisper/MMS-TTS providers and the hosted
    OpenAI LLM into livekit-agents' AgentSession, which supplies turn
    detection, interruption handling, and STT->LLM->TTS orchestration --
    none of that is hand-rolled here. Acceptance is a working voice
    conversation in /demo with no avatar dependency; avatar wiring is
    Phase 2/3, not this pass.
    """
    logger.info("chatdialect-agent connecting to room=%s", ctx.room.name)
    await ctx.connect()

    session = AgentSession(
        stt=WhisperSTT(_stt_provider),
        llm=ChatDialectLLM(_llm_provider),
        tts=MmsTTS(_tts_provider, sample_rate=_tts_provider.sample_rate),
    )

    @session.on("user_input_transcribed")
    def _on_user_transcript(event: UserInputTranscribedEvent) -> None:
        if event.is_final:
            logger.info("user transcript: %s", event.transcript)

    @session.on("conversation_item_added")
    def _on_conversation_item(event) -> None:  # noqa: ANN001 -- ConversationItemAddedEvent
        item = event.item
        if isinstance(item, ChatMessage) and item.role == "assistant":
            logger.info("assistant response: %s", item.text_content)

    await session.start(agent=Agent(instructions=SYSTEM_INSTRUCTIONS), room=ctx.room)
    logger.info(
        "chatdialect-agent session started: stt=%s llm=ready tts=%s",
        _config.whisper_model_checkpoint,
        _config.mms_tts_checkpoint,
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
