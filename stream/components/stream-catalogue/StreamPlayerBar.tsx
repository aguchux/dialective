'use client';

import {
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  Plus,
  Check,
} from 'lucide-react';
import type { CatalogueCollection } from './types';
import { CoverImage, formatDuration, Waveform } from './primitives';

export function StreamPlayerBar({
  added,
  collection,
  isPlaying,
  onAdd,
  onToggle,
}: {
  added: boolean;
  collection: CatalogueCollection | null;
  isPlaying: boolean;
  onAdd: () => void;
  onToggle: () => void;
}) {
  if (!collection) return null;

  return (
    <footer
      aria-label="Voice preview player"
      className="fixed inset-x-0 bottom-0 z-40 h-[var(--catalogue-player-height)] overflow-hidden border-t border-catalogue-line bg-catalogue-surface/95 px-3 shadow-[0_-6px_20px_rgba(0,0,0,0.28)] backdrop-blur-md sm:px-4"
    >
      <div className="mx-auto grid h-full max-w-[1800px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(200px,0.8fr)_minmax(260px,1.4fr)_minmax(170px,0.8fr)] lg:gap-5">
        <div className="flex min-w-0 items-center gap-2">
          <CoverImage
            alt={collection.coverAlt}
            className="size-8 shrink-0 rounded object-cover"
            height={32}
            src={collection.coverUrl}
            width={32}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-catalogue-ink">
              {collection.preview.title.split(' • ').slice(0, 3).join(' • ')}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-catalogue-muted">
              {collection.title} • {collection.country}
              <span className="size-1.5 shrink-0 rounded-full bg-catalogue-green" />
            </p>
          </div>
          <button
            aria-label="Like preview"
            className="ml-auto hidden size-7 shrink-0 place-items-center rounded-full text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink sm:grid"
            type="button"
          >
            <Heart aria-hidden="true" className="size-3.5" />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-1 text-catalogue-muted sm:flex">
            <PlayerButton label="Shuffle">
              <Shuffle aria-hidden="true" className="size-3.5" />
            </PlayerButton>
            <PlayerButton label="Previous">
              <SkipBack aria-hidden="true" className="size-3.5" fill="currentColor" />
            </PlayerButton>
          </div>
          <button
            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-catalogue-blue text-white hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60"
            onClick={onToggle}
            type="button"
          >
            {isPlaying ? (
              <Pause aria-hidden="true" className="size-3.5" fill="currentColor" />
            ) : (
              <Play aria-hidden="true" className="ml-0.5 size-3.5" fill="currentColor" />
            )}
          </button>
          <div className="hidden items-center gap-1 text-catalogue-muted sm:flex">
            <PlayerButton label="Next">
              <SkipForward aria-hidden="true" className="size-3.5" fill="currentColor" />
            </PlayerButton>
            <PlayerButton label="Repeat">
              <Repeat2 aria-hidden="true" className="size-3.5" />
            </PlayerButton>
          </div>
          <span className="hidden text-[10px] text-catalogue-dim sm:inline">0:12</span>
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="h-1 overflow-hidden rounded-full bg-catalogue-line-strong">
              <span className="block h-full w-[42%] rounded-full bg-catalogue-blue" />
            </div>
            <div className="mt-1 h-2.5">
              <Waveform active={isPlaying} bars={collection.preview.waveform} progress={0.42} />
            </div>
          </div>
          <span className="hidden text-[10px] text-catalogue-dim sm:inline">
            {formatDuration(collection.preview.durationSeconds)}
          </span>
        </div>

        <div className="hidden items-center justify-end gap-1.5 lg:flex">
          <div className="flex items-center gap-1.5 text-catalogue-muted">
            <Volume2 aria-hidden="true" className="size-3.5" />
            <input
              aria-label="Preview volume"
              className="h-1 w-16 accent-catalogue-blue"
              defaultValue="68"
              max="100"
              min="0"
              type="range"
            />
          </div>
          <button
            aria-label={added ? 'Preview added to deck' : 'Add preview to deck'}
            className={`hidden min-h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold sm:inline-flex ${added ? 'border-catalogue-green/40 text-catalogue-green' : 'border-catalogue-line-strong text-catalogue-ink hover:bg-catalogue-surface-hover'}`}
            onClick={onAdd}
            type="button"
          >
            {added ? (
              <Check aria-hidden="true" className="size-3" />
            ) : (
              <Plus aria-hidden="true" className="size-3" />
            )}
            {added ? 'Added' : 'Add to Deck'}
          </button>
          <button
            aria-label="Open queue"
            className="grid size-8 place-items-center rounded-md text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
            type="button"
          >
            <ListMusic aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}

function PlayerButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="grid size-6 place-items-center rounded-full hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
      type="button"
    >
      {children}
    </button>
  );
}
