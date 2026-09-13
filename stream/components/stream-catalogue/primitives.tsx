'use client';

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
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
    <span className="inline-flex items-center gap-1 rounded-md bg-catalogue-blue px-2 py-1 text-[11px] font-bold text-white">
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
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByAmount(direction: 1 | -1) {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: 'smooth' });
  }

  return (
    <div className="relative min-w-0">
      <div
        aria-label={label}
        className="stream-catalogue-scrollbar flex min-w-0 gap-2 overflow-x-auto scroll-smooth pb-1"
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
