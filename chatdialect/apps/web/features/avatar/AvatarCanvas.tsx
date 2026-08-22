'use client';

import { Canvas } from '@react-three/fiber';
import { AvatarFace } from './AvatarFace';
import type { AvatarTargets } from './useAvatarController';

// Responsive canvas (doc §21: "mobile resize does not break scene") --
// Canvas's default resize observer + fixed camera fov keeps the face
// framed correctly across viewport sizes without extra layout logic.

interface AvatarCanvasProps {
  targets: React.MutableRefObject<AvatarTargets>;
}

export function AvatarCanvas({ targets }: AvatarCanvasProps) {
  return (
    <div className="aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-neutral-100">
      <Canvas camera={{ position: [0, 0, 3.2], fov: 35 }} dpr={[1, 2]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 4]} intensity={1.1} />
        <directionalLight position={[-2, 1, -2]} intensity={0.3} />
        <AvatarFace targets={targets} />
      </Canvas>
    </div>
  );
}
