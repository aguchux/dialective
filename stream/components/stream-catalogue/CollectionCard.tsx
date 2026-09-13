'use client';

import { Headphones } from 'lucide-react';
import type { CatalogueCollection } from './types';
import { CoverImage, PlayButton, ScoreBadge } from './primitives';

export function CollectionCard({
  collection,
  onPlay,
  onSelect,
  selected,
}: {
  collection: CatalogueCollection;
  onPlay: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <article
      className={`group relative w-[174px] shrink-0 cursor-pointer rounded-[10px] border bg-catalogue-surface-raised p-1.5 text-left transition-all hover:-translate-y-0.5 hover:border-catalogue-line-strong hover:bg-catalogue-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 sm:w-[184px] ${
        selected
          ? 'border-catalogue-blue/80 shadow-[0_0_0_1px_rgba(168,102,224,0.2)]'
          : 'border-catalogue-line'
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative aspect-[1.08] overflow-hidden rounded-lg">
        <CoverImage
          alt={collection.coverAlt}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          height={170}
          src={collection.coverUrl}
          width={184}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(4,10,20,0.9),transparent_68%)]" />
        <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          <PlayButton label={`Preview ${collection.title}`} onClick={onPlay} />
          <ScoreBadge score={collection.qualityScore} />
        </div>
      </div>
      <div className="px-1 pb-1 pt-2">
        <div className="flex items-center gap-1.5">
          <h3 className="min-w-0 truncate text-[13px] font-bold text-catalogue-ink">
            {collection.title}
          </h3>
          {collection.status === 'verified' && (
            <span className="size-1.5 shrink-0 rounded-full bg-catalogue-green" title="Verified" />
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-catalogue-muted">
          <Headphones aria-hidden="true" className="size-3" />
          {collection.hours} hrs •{' '}
          {collection.speakers >= 1000
            ? `${(collection.speakers / 1000).toFixed(1)}K`
            : collection.speakers}{' '}
          speakers
        </p>
      </div>
    </article>
  );
}
