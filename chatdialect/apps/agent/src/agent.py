import logging

from dotenv import load_dotenv
from livekit.agents import JobContext, WorkerOptions, cli

from config import AgentConfig
from providers.llm import OpenAIGPTProvider
from providers.stt import WhisperLocalProvider
from providers.tts import MmsTtsProvider

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chatdialect-agent")

_config = AgentConfig()

# Providers load once at process startup (import time, not per-job) --
# mirrors whisper-worker's/prompt-audio-service's own module-level
# _model_cache pattern (see stt.py/tts.py's docstrings). Loaded here rather
# than inside entrypoint() so the cold-load cost is paid once per worker
# process, not once per conversation.
_stt = WhisperLocalProvider(_config.whisper_model_checkpoint)
_llm = OpenAIGPTProvider(_config.openai_api_key)
_tts = MmsTtsProvider(_config.mms_tts_checkpoint)


async def entrypoint(ctx: JobContext) -> None:
    """
    Phase 0 scaffold only -- registers this worker with the LiveKit room and
    confirms the providers loaded, but does not yet wire VAD/turn detection,
    STT->LLM->TTS conversation flow, or avatar event emission. That's the
    remainder of Phase 1 (docs/CHATDIALECT_MVP_PLAN.md §20), a separate,
    substantial implementation pass -- see the plan's "Phase 1 kickoff"
    section for why this boundary is deliberate.
    """
    logger.info("chatdialect-agent connecting to room=%s", ctx.room.name)
    await ctx.connect()
    logger.info(
        "chatdialect-agent connected: stt=%s llm=ready tts=%s",
        _config.whisper_model_checkpoint,
        _config.mms_tts_checkpoint,
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
