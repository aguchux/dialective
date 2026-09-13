'use client';

import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CirclePlay, MoreHorizontal, Play } from 'lucide-react';

export function formatHours(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} hrs`;
}

export function formatSpeakers(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return value.toLocaleString('en-US');
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function CoverImage({
  alt,
  className = '',
  height,
  src,
  width,
}: {
  alt: string;
  className?: string;
  height: number;
  src: string;
  width: number;
}) {
  return (
    <img alt={alt} className={className} height={height} loading="lazy" src={src} width={width} />
  );
}

export function Waveform({
  active = false,
  bars,
  className = '',
  progress = 0,
}: {
  active?: boolean;
  bars: number[];
  className?: string;
  progress?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-full items-center gap-px overflow-hidden ${className}`}
    >
      {bars.map((height, index) => (
        <span
          className={`stream-catalogue-waveform-bar block min-w-[2px] flex-1 rounded-full transition-colors ${
            index / bars.length <= progress
              ? 'bg-catalogue-blue-bright'
              : active
                ? 'bg-catalogue-line-strong'
                : 'bg-catalogue-dim/80'
          }`}
          key={`${height}-${index}`}
          style={
            { '--wave-height': `${height}%`, animationDelay: `${index * 38}ms` } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-catalogue-blue/80 px-2 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm">
      {score.toFixed(1)}
    </span>
  );
}

export function VerifiedMark() {
  return (
    <span
      aria-label="Verified collection"
      className="grid size-4 place-items-center rounded-full bg-catalogue-blue text-white"
      title="Verified"
    >
      <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />
    </span>
  );
}

export function SectionHeading({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[15px] font-bold text-catalogue-ink sm:text-base">{title}</h2>
      {action}
    </div>
  );
}

export function PlayButton({
  label,
  onClick,
  size = 'sm',
}: {
  label: string;
  onClick: () => void;
  size?: 'sm' | 'lg';
}) {
  const sizeClass = size === 'lg' ? 'size-12' : 'size-8';
  const iconClass = size === 'lg' ? 'size-5' : 'size-3.5';
  return (
    <button
      aria-label={label}
      className={`grid ${sizeClass} shrink-0 place-items-center rounded-full bg-catalogue-blue text-white shadow-lg transition-colors hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60`}
      onClick={onClick}
      type="button"
    >
      <Play aria-hidden="true" className={iconClass} fill="currentColor" />
    </button>
  );
}

export function MoreButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      className="grid size-8 place-items-center rounded-full text-catalogue-muted transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
      onClick={onClick}
      type="button"
    >
      <MoreHorizontal aria-hidden="true" className="size-4" />
    </button>
  );
}

export function FocusableRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className="min-w-0 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function CarouselRow({
  children,
  hideScrollbar = false,
  label,
}: {
  children: ReactNode;
  hideScrollbar?: boolean;
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null>(
    null,
  );
  const suppressNextClick = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  function scrollByAmount(direction: 1 | -1) {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: 'smooth' });
  }

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    // React attaches onWheel as a passive listener, which silently drops
    // preventDefault() -- registering natively with passive:false is the
    // only way to actually claim vertical wheel input for horizontal
    // scroll instead of the page scrolling underneath the row.
    function handleWheel(event: globalThis.WheelEvent) {
      if (!node || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    }

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, []);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scrollerRef.current;
    if (!node || event.pointerType === 'touch' || event.button !== 0) return;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: node.scrollLeft,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scrollerRef.current;
    const drag = dragState.current;
    if (!node || !drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) > 3) {
      drag.moved = true;
      node.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }
    if (!drag.moved) return;
    node.scrollLeft = drag.startScrollLeft - delta;
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scrollerRef.current;
    const drag = dragState.current;
    if (!node || !drag || drag.pointerId !== event.pointerId) return;
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    dragState.current = null;
    if (isDragging) setIsDragging(false);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    // Swallow the trailing click that follows a drag so cards don't get
    // "selected" just because the pointer released over them.
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }

  return (
    <div className="relative min-w-0">
      <div
        aria-label={label}
        className={`flex min-w-0 gap-2 overflow-x-auto transition-[filter] duration-200 ${
          hideScrollbar ? 'stream-catalogue-scrollbar-hidden' : 'stream-catalogue-scrollbar pb-1'
        } ${
          isDragging
            ? 'cursor-grabbing scroll-auto select-none brightness-110 saturate-125'
            : 'cursor-grab scroll-smooth'
        }`}
        onClickCapture={handleClickCapture}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerLeave={endDrag}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          suppressNextClick.current = dragState.current?.moved ?? false;
          endDrag(event);
        }}
        ref={scrollerRef}
        role="group"
      >
        {children}
      </div>
      <button
        aria-label={`Scroll ${label} left`}
        className="absolute left-1 top-1/2 z-10 hidden size-7 -translate-y-1/2 place-items-center rounded-full bg-catalogue-blue text-white shadow-catalogue transition-colors hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60 sm:grid"
        onClick={() => scrollByAmount(-1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label={`Scroll ${label} right`}
        className="absolute right-1 top-1/2 z-10 hidden size-7 -translate-y-1/2 place-items-center rounded-full bg-catalogue-blue text-white shadow-catalogue transition-colors hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60 sm:grid"
        onClick={() => scrollByAmount(1)}
        type="button"
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function EmptyCatalogueState({ query }: { query: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-[10px] border border-dashed border-catalogue-line-strong bg-catalogue-surface/60 p-6 text-center">
      <div>
        <CirclePlay aria-hidden="true" className="mx-auto size-8 text-catalogue-dim" />
        <p className="mt-3 text-sm font-semibold text-catalogue-ink">No voice collections found</p>
        <p className="mt-1 text-xs text-catalogue-muted">
          {query
            ? `Try a different search than “${query}”.`
            : 'Clear a filter to see more collections.'}
        </p>
      </div>
    </div>
  );
}
