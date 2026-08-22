# Doc §12/§14: emotion validation lives here as the LLM's structured
# {text, emotion} output is the only emotion source in the MVP (deterministic
# acoustic emotion-from-speech classification is Stage 2/post-MVP, doc §42).
# providers/llm.py's _validate_response already enforces the allowed-emotion
# set and clamps intensity -- this module exists as the named home for that
# logic per docs/CHATDIALECT_MVP_PLAN.md §6's layout, re-exported from
# providers.llm so there's one implementation, not two.

from providers.llm import ALLOWED_EMOTIONS, EmotionTag

__all__ = ["ALLOWED_EMOTIONS", "EmotionTag"]
