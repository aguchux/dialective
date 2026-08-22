// Provider-neutral avatar control surface -- see
// docs/CHATDIALECT_MVP_PLAN.md §28. apps/web's avatar renderer (Phase 2,
// not implemented yet) must consume this interface, never a provider's
// raw viseme/emotion names directly -- this is what lets a future
// Dialect Library TTS/emotion/viseme provider replace the MVP's providers
// without the avatar-rendering code changing.

import type { AvatarEmotion, AvatarState } from '@chatdialect/shared-types';

export interface NormalizedViseme {
  id: string;
  weight: number;
}

export interface AvatarController {
  setState(state: AvatarState): void;
  setEmotion(emotion: AvatarEmotion, intensity: number): void;
  pushViseme(viseme: NormalizedViseme): void;
  setAudioLevel(level: number): void;
  resetSpeech(): void;
}
