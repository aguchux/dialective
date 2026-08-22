'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarTargets } from './useAvatarController';

// Procedural placeholder face (doc §21's Phase 2 acceptance: blink, jaw
// open/close, smile, emotion mapping, state transitions -- all satisfied
// without depending on any external rigged asset). No GLB/VRM currently
// exists for this project since Ready Player Me shut down public access
// on 2026-01-31 -- see chatdialect/AGENTS.md. Swapping in a real rigged
// model later only means replacing this component's mesh construction;
// useAvatarController/AvatarController stay the same either side of that
// swap, since nothing outside this file depends on how the face is drawn.

const EASE = 0.12; // per-frame lerp factor -- higher = snappier, lower = smoother
const BLINK_INTERVAL_MIN = 2.5;
const BLINK_INTERVAL_MAX = 5.5;
const BLINK_DURATION = 0.14;

interface AvatarFaceProps {
  targets: React.MutableRefObject<AvatarTargets>;
}

export function AvatarFace({ targets }: AvatarFaceProps) {
  const headGroup = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const leftBrow = useRef<THREE.Mesh>(null);
  const rightBrow = useRef<THREE.Mesh>(null);

  const state = useRef({
    jawOpen: 0,
    smile: 0,
    browRaise: 0,
    browFurrow: 0,
    blink: 0,
    nextBlinkAt: BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN),
    blinkingUntil: 0,
    elapsed: 0,
    idleBob: Math.random() * Math.PI * 2,
  });

  useFrame((_, delta) => {
    const t = targets.current;
    const s = state.current;
    s.elapsed += delta;

    // -- blink cycle: idle-timed, randomized interval --
    if (s.elapsed >= s.nextBlinkAt && s.blinkingUntil <= s.elapsed) {
      s.blinkingUntil = s.elapsed + BLINK_DURATION;
      s.nextBlinkAt =
        s.elapsed + BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
    }
    const blinking = s.elapsed < s.blinkingUntil;
    s.blink += ((blinking ? 1 : 0) - s.blink) * 0.6;

    // -- jaw: amplitude/viseme-driven target, eased toward each frame --
    const jawTarget = t.activeViseme ? t.activeViseme.weight : t.jawOpen;
    s.jawOpen += (jawTarget - s.jawOpen) * EASE;

    // -- emotion -> smile/brow mapping (doc §24's "test prompts should
    // produce a mild happy expression", extended to the full emotion set) --
    const intensity = t.emotionIntensity;
    const smileTarget =
      t.emotion === 'happy' ? intensity : t.emotion === 'confused' ? intensity * 0.2 : 0;
    const browRaiseTarget = t.emotion === 'happy' || t.emotion === 'confused' ? intensity * 0.6 : 0;
    const browFurrowTarget = t.emotion === 'concerned' ? intensity : 0;
    s.smile += (smileTarget - s.smile) * EASE;
    s.browRaise += (browRaiseTarget - s.browRaise) * EASE;
    s.browFurrow += (browFurrowTarget - s.browFurrow) * EASE;

    if (mouth.current) {
      const openScale = 1 + s.jawOpen * 1.8;
      mouth.current.scale.set(1 + s.smile * 0.3, openScale, 1);
      mouth.current.position.y = -0.35 - s.jawOpen * 0.08;
    }
    if (leftEye.current && rightEye.current) {
      const eyeScaleY = Math.max(0.05, 1 - s.blink);
      leftEye.current.scale.y = eyeScaleY;
      rightEye.current.scale.y = eyeScaleY;
    }
    if (leftBrow.current && rightBrow.current) {
      const raise = s.browRaise * 0.08 - s.browFurrow * 0.04;
      leftBrow.current.position.y = 0.42 + raise;
      rightBrow.current.position.y = 0.42 + raise;
      leftBrow.current.rotation.z = s.browFurrow * 0.25;
      rightBrow.current.rotation.z = -s.browFurrow * 0.25;
    }

    // -- head micro-motion (doc §21) + a slightly larger sway while
    // "listening"/"speaking" so the state reads at a glance --
    if (headGroup.current) {
      const activity = t.state === 'listening' || t.state === 'speaking' ? 1 : 0.3;
      headGroup.current.rotation.y = Math.sin(s.elapsed * 0.6 + s.idleBob) * 0.04 * activity;
      headGroup.current.rotation.x = Math.sin(s.elapsed * 0.8 + s.idleBob) * 0.02 * activity;
    }
  });

  return (
    <group ref={headGroup}>
      <mesh>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#f2c9a0" roughness={0.6} />
      </mesh>
      <mesh ref={leftEye} position={[-0.35, 0.15, 0.85]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={rightEye} position={[0.35, 0.15, 0.85]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={leftBrow} position={[-0.35, 0.42, 0.88]}>
        <boxGeometry args={[0.22, 0.04, 0.04]} />
        <meshStandardMaterial color="#4a2f1a" />
      </mesh>
      <mesh ref={rightBrow} position={[0.35, 0.42, 0.88]}>
        <boxGeometry args={[0.22, 0.04, 0.04]} />
        <meshStandardMaterial color="#4a2f1a" />
      </mesh>
      <mesh ref={mouth} position={[0, -0.35, 0.9]}>
        <boxGeometry args={[0.35, 0.08, 0.08]} />
        <meshStandardMaterial color="#7a2e2e" />
      </mesh>
    </group>
  );
}
