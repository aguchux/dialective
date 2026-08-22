import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

logger = logging.getLogger("chatdialect-agent")

# Must match packages/shared-types's AvatarEmotion exactly -- see
# docs/CHATDIALECT_MVP_PLAN.md §12: "Never allow arbitrary emotion names
# from the LLM to flow directly into the renderer."
ALLOWED_EMOTIONS = {"neutral", "happy", "concerned", "confused"}


@dataclass
class EmotionTag:
    type: str
    intensity: float


@dataclass
class AgentResponse:
    text: str
    emotion: EmotionTag


class LanguageModelProvider(ABC):
    @abstractmethod
    async def respond(self, transcript: str, history: list[dict]) -> AgentResponse:
        """Generates a structured {text, emotion} response for one conversation turn. Provider-neutral -- agent.py never imports a concrete provider directly."""
        raise NotImplementedError


def _validate_response(raw: dict) -> AgentResponse:
    """
    Doc §14: if validation fails, fall back to {text, emotion: neutral/0}
    rather than letting malformed LLM metadata break audio response. Text
    itself is always trusted verbatim (even a malformed emotion tag
    shouldn't discard what the model actually said); only the emotion tag
    is validated/clamped.
    """
    text = str(raw.get("text", "")).strip()
    emotion_raw = raw.get("emotion") if isinstance(raw.get("emotion"), dict) else {}
    emotion_type = emotion_raw.get("type")
    intensity = emotion_raw.get("intensity")

    if emotion_type not in ALLOWED_EMOTIONS or not isinstance(intensity, (int, float)):
        return AgentResponse(text=text, emotion=EmotionTag(type="neutral", intensity=0.0))

    clamped_intensity = max(0.0, min(1.0, float(intensity)))
    return AgentResponse(text=text, emotion=EmotionTag(type=emotion_type, intensity=clamped_intensity))


class OpenAIGPTProvider(LanguageModelProvider):
    """
    The one hosted-API adapter in this plan -- see the plan's provider
    decisions: a capable self-hosted conversational LLM needs GPU infra
    this repo's CPU-only posture doesn't have.
    """

    SYSTEM_PROMPT = (
        "You are ChatDialect, a helpful voice assistant. Always respond with a single JSON object "
        'of the shape {"text": string, "emotion": {"type": "neutral"|"happy"|"concerned"|"confused", '
        '"intensity": number between 0 and 1}}. Keep responses concise and conversational, since they '
        "will be spoken aloud."
    )

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def respond(self, transcript: str, history: list[dict]) -> AgentResponse:
        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}, *history, {"role": "user", "content": transcript}]
        completion = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or "{}"
        try:
            raw = json.loads(content)
        except json.JSONDecodeError:
            logger.warning("LLM returned non-JSON content, falling back to neutral emotion: %r", content)
            return AgentResponse(text=content.strip(), emotion=EmotionTag(type="neutral", intensity=0.0))
        return _validate_response(raw)
