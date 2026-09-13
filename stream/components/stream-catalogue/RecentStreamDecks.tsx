'use client';

import { Check, Clock3, Plus } from 'lucide-react';
import type { StreamDeck } from './types';
import { CoverImage, DeckPillSkeleton, FocusableRow, formatDuration, Waveform } from './primitives';

export function RecentStreamDecks({
  addedDeckIds,
  decks,
  isLoading = false,
  onAdd,
  onSelect,
}: {
  addedDeckIds: Set<string>;
  decks: StreamDeck[];
  isLoading?: boolean;
  onAdd: (id: string) => void;
  onSelect: (deck: StreamDeck) => void;
}) {
  return (
    <section className="flex min-w-0 flex-col" id="stream-decks">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-catalogue-ink sm:text-base">
          Recently Added to Stream Decks
        </h2>
        <button
          className="text-xs font-semibold text-catalogue-blue-bright hover:text-catalogue-ink"
          type="button"
        >
          View all
        </button>
      </div>
      <div className="mt-2 grid flex-1 auto-rows-fr gap-2">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => <DeckPillSkeleton key={index} />)
          : decks.map((deck) => {
              const added = addedDeckIds.has(deck.id);
              return (
                <FocusableRow key={deck.id} onClick={() => onSelect(deck)}>
                  <div className="grid min-w-0 grid-cols-[34px_minmax(0,1.05fr)_minmax(80px,0.9fr)_auto_auto] items-center gap-2 rounded-full border border-catalogue-line bg-catalogue-surface px-2.5 py-2 transition-colors hover:border-catalogue-line-strong hover:bg-catalogue-surface-hover sm:grid-cols-[38px_minmax(0,1.2fr)_minmax(120px,1fr)_auto_auto] sm:gap-3 sm:px-3">
                    <CoverImage
                      alt={deck.coverAlt}
                      className="size-8 rounded-full object-cover sm:size-9"
                      height={36}
                      src={deck.coverUrl}
                      width={36}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-catalogue-ink">
                        {deck.title}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-catalogue-muted">
                        {deck.dialect} • {deck.country}
                      </p>
                    </div>
                    <div className="hidden h-6 min-w-0 sm:block">
                      <Waveform bars={deck.waveform} />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-catalogue-muted">
                      <Clock3 aria-hidden="true" className="size-3" />
                      {formatDuration(deck.durationSeconds)}
                    </span>
                    <button
                      aria-label={
                        added ? `${deck.title} added to deck` : `Add ${deck.title} to deck`
                      }
                      className={`grid size-7 place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 ${
                        added
                          ? 'border-catalogue-green/50 bg-catalogue-green/10 text-catalogue-green'
                          : 'border-catalogue-line-strong text-catalogue-muted hover:border-catalogue-blue hover:text-catalogue-blue-bright'
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAdd(deck.id);
                      }}
                      type="button"
                    >
                      {added ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Plus aria-hidden="true" className="size-3.5" />
                      )}
                    </button>
                  </div>
                </FocusableRow>
              );
            })}
      </div>
    </section>
  );
}
