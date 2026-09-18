'use client';

import { useRef, useState } from 'react';

const LENS_SIZE = 180;
const ZOOM = 2.5;

/**
 * A blurred identity document that is only legible under a round lens
 * following the pointer.
 *
 * The blur is the point: a reviewer needs to read a name and a number,
 * which they can do a patch at a time, but the whole card is never
 * legible at once on screen. That makes a casual screenshot far less
 * useful than the document itself.
 *
 * Copy/drag/right-click/selection are disabled on the image. Those are
 * deterrents against casual copying, NOT security -- a determined viewer
 * can still photograph their own screen. The real protections are
 * server-side: the image is already grayscale and watermarked
 * (KycEvidenceRedactionService), it needs a live claim to fetch, and
 * every view is logged.
 */
export function DocumentMagnifier({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  function move(clientX: number, clientY: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // Drop the lens when the pointer leaves the image, rather than
    // clamping it to the edge and leaving a readable patch parked there.
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setLens(null);
      return;
    }
    setSize({ width: rect.width, height: rect.height });
    setLens({ x, y });
  }

  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-lg border border-line bg-black/5"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onMouseLeave={() => setLens(null)}
      onMouseMove={(e) => move(e.clientX, e.clientY)}
      onTouchEnd={() => setLens(null)}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (touch) move(touch.clientX, touch.clientY);
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (touch) move(touch.clientX, touch.clientY);
      }}
      ref={containerRef}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a presigned,
          no-store review copy: next/image would try to proxy and cache it. */}
      <img
        alt={alt}
        className="pointer-events-none w-full blur-[6px]"
        draggable={false}
        src={src}
      />
      {lens && size && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full border-2 border-white shadow-lg"
          style={{
            width: LENS_SIZE,
            height: LENS_SIZE,
            left: lens.x - LENS_SIZE / 2,
            top: lens.y - LENS_SIZE / 2,
            backgroundImage: `url(${src})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${size.width * ZOOM}px ${size.height * ZOOM}px`,
            backgroundPosition: `${-(lens.x * ZOOM - LENS_SIZE / 2)}px ${-(
              lens.y * ZOOM -
              LENS_SIZE / 2
            )}px`,
          }}
        />
      )}
      {!lens && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-black text-white drop-shadow">
          Move your pointer over the document to read it
        </p>
      )}
    </div>
  );
}
