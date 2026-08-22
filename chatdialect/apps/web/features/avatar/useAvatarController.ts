'use client';

import { useMemo, useRef } from 'react';
import type { AvatarEmotion, AvatarState } from '@chatdialect/shared-types';
import type { AvatarController, NormalizedViseme } from '@chatdialect/avatar-protocol';

// Phase 2 (docs/CHATDIALECT_MVP_PLAN.md §21/§28): the renderer's write side
// of AvatarController. Target values are written into a mutable ref that
// AvatarFace's useFrame loop reads and eases toward every frame -- state
// lives outside React so 60fps animation doesn't trigger re-renders.
// Phase 4/5 (viseme/emotion-driven animation) call the same setters this
// hook already exposes; nothing here is AI-specific.

export interface AvatarTargets {
  state: AvatarState;
  emotion: AvatarEmotion;
  emotionIntensity: number;
  jawOpen: number;
  audioLevel: number;
  activeViseme: NormalizedViseme | null;
}

export function useAvatarController() {
  const targets = useRef<AvatarTargets>({
    state: 'idle',
    emotion: 'neutral',
    emotionIntensity: 0,
    jawOpen: 0,
    audioLevel: 0,
    activeViseme: null,
  });

  const controller = useMemo<AvatarController>(
    () => ({
      setState(state) {
        targets.current.state = state;
      },
      setEmotion(emotion, intensity) {
        targets.current.emotion = emotion;
        targets.current.emotionIntensity = Math.max(0, Math.min(1, intensity));
      },
      pushViseme(viseme) {
        targets.current.activeViseme = viseme;
      },
      setAudioLevel(level) {
        targets.current.audioLevel = Math.max(0, Math.min(1, level));
        // amplitude-driven jaw is the Tier-1 lip-sync fallback (doc §11)
        // when no viseme data is available.
        targets.current.jawOpen = targets.current.audioLevel;
      },
      resetSpeech() {
        targets.current.jawOpen = 0;
        targets.current.audioLevel = 0;
        targets.current.activeViseme = null;
      },
    }),
    [],
  );

  return { controller, targets };
}
