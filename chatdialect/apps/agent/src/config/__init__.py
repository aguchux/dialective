import os


def get_env(name: str, default: str | None = None, *, required: bool = False) -> str | None:
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"{name} must be set")
    return value


class AgentConfig:
    """
    Central place agent.py and the provider adapters read env vars from --
    mirrors PlatformSettingsService's role in services/api of being the one
    place config is resolved, though this is a plain dataclass-shaped
    loader (no DB-backed override layer needed for the MVP).
    """

    def __init__(self) -> None:
        self.livekit_url = get_env("LIVEKIT_URL", required=True)
        self.livekit_api_key = get_env("LIVEKIT_API_KEY", required=True)
        self.livekit_api_secret = get_env("LIVEKIT_API_SECRET", required=True)
        self.openai_api_key = get_env("OPENAI_API_KEY", required=True)
        # Self-hosted STT/TTS checkpoints -- no API key needed, see
        # docs/CHATDIALECT_MVP_PLAN.md's provider decisions in the plan.
        # Open Whisper by default; swap to an NCAIR1 dialect checkpoint
        # (e.g. NCAIR1/Igbo-ASR) to directly exercise a Dialect Library
        # model under test.
        self.whisper_model_checkpoint = get_env("WHISPER_MODEL_CHECKPOINT", default="openai/whisper-small")
        self.mms_tts_checkpoint = get_env("MMS_TTS_CHECKPOINT", default="facebook/mms-tts-eng")
