'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarEmotion, AvatarState } from '@chatdialect/shared-types';
import { AvatarCanvas } from '../../../features/avatar/AvatarCanvas';
import { useAvatarController } from '../../../features/avatar/useAvatarController';

// doc §21's /dev/avatar: exercises the avatar in isolation, no AI/LiveKit
// dependency -- state transitions, emotion mapping, jaw/blink all driven
// by plain buttons here, same AvatarController calls Phase 3's real
// conversation wiring will make.

const STATES: AvatarState[] = ['idle', 'listening', 'thinking', 'speaking', 'error'];
const EMOTIONS: AvatarEmotion[] = ['neutral', 'happy', 'concerned', 'confused'];

export default function AvatarDevPage() {
  const { controller, targets } = useAvatarController();
  const [state, setState] = useState<AvatarState>('idle');
  const [emotion, setEmotion] = useState<AvatarEmotion>('neutral');
  const [intensity, setIntensity] = useState(0.6);
  const [jawOpen, setJawOpen] = useState(false);
  const jawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    controller.setState(state);
  }, [controller, state]);

  useEffect(() => {
    controller.setEmotion(emotion, intensity);
  }, [controller, emotion, intensity]);

  useEffect(() => {
    if (jawOpen) {
      let t = 0;
      jawIntervalRef.current = setInterval(() => {
        t += 0.15;
        controller.setAudioLevel(Math.abs(Math.sin(t)));
      }, 80);
    } else if (jawIntervalRef.current) {
      clearInterval(jawIntervalRef.current);
      controller.resetSpeech();
    }
    return () => {
      if (jawIntervalRef.current) clearInterval(jawIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jawOpen]);

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Avatar controls</h1>
      <AvatarCanvas targets={targets} />

      <section className="flex w-full max-w-md flex-col gap-6">
        <ControlGroup label="State">
          {STATES.map((s) => (
            <ToggleButton key={s} active={state === s} onClick={() => setState(s)}>
              {s}
            </ToggleButton>
          ))}
        </ControlGroup>

        <ControlGroup label="Emotion">
          {EMOTIONS.map((e) => (
            <ToggleButton key={e} active={emotion === e} onClick={() => setEmotion(e)}>
              {e}
            </ToggleButton>
          ))}
        </ControlGroup>

        <label className="flex flex-col gap-1 text-sm">
          Emotion intensity: {intensity.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />
        </label>

        <ToggleButton active={jawOpen} onClick={() => setJawOpen((v) => !v)}>
          {jawOpen ? 'Stop mouth animation' : 'Animate mouth (simulated audio level)'}
        </ToggleButton>
      </section>
    </main>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm capitalize ${
        active
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-300 text-neutral-700'
      }`}
    >
      {children}
    </button>
  );
}
