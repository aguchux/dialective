// Domain model shared between apps/web and (mirrored in Python dataclasses,
// since Python can't import TS directly) apps/agent -- see
// docs/CHATDIALECT_MVP_PLAN.md §7. This is the single source of truth for
// apps/web; apps/agent/src/config keeps an independently-defined mirror,
// same cross-language duplication precedent as this repo's own Python
// workers (e.g. spaces.py duplicated across vosk-worker/whisper-worker/
// prompt-audio-service).

export type ConversationSessionStatus =
  | 'connecting'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'ended';

export interface ConversationSession {
  id: string;
  status: ConversationSessionStatus;
  language?: string;
  dialect?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  source: 'voice' | 'text';
  text: string;
  createdAt: string;
}

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type AvatarEmotion = 'neutral' | 'happy' | 'concerned' | 'confused';

export interface AvatarEvent {
  state: AvatarState;
  emotion?: {
    type: AvatarEmotion;
    intensity: number; // 0..1
  };
  viseme?: {
    id: string;
    weight: number;
  };
  jawOpen?: number;
  audioLevel?: number;
  timestamp: number;
}
