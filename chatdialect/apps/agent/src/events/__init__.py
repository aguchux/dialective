# AvatarEvent-shaped event emission (doc §7) -- stub in this plan. Full
# conversation-to-avatar-state wiring (doc §22/§23) is not part of Phase 0;
# this module exists as the named home for it per docs/CHATDIALECT_MVP_PLAN.md
# §6's layout, mirroring packages/shared-types's AvatarEvent shape so
# apps/web and apps/agent agree on the wire format once this is implemented.

from dataclasses import dataclass


@dataclass
class AvatarEvent:
    state: str  # AvatarState: idle | listening | thinking | speaking | error
    timestamp: float
    emotion: dict | None = None
    viseme: dict | None = None
    jaw_open: float | None = None
    audio_level: float | None = None
