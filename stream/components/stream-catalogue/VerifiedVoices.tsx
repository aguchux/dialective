'use client';

import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import type { VerifiedSpeaker } from './types';
import { CarouselRow, CoverImage, FocusableRow, ScoreBadge, VoiceCardSkeleton } from './primitives';

const VISIBLE_LIMIT = 12;

export function VerifiedVoices({
  isLoading = false,
  onSelect,
  speakers,
}: {
  isLoading?: boolean;
  onSelect: (speaker: VerifiedSpeaker) => void;
  speakers: VerifiedSpeaker[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleSpeakers = showAll ? speakers : speakers.slice(0, VISIBLE_LIMIT);
  const hasMore = speakers.length > VISIBLE_LIMIT;

  return (
    <section className="flex min-w-0 flex-col" id="voice-library">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-catalogue-ink sm:text-base">
          Top Verified Voices
        </h2>
        {!isLoading && hasMore && (
          <button
            className="text-xs font-semibold text-catalogue-blue-bright hover:text-catalogue-ink"
            onClick={() => setShowAll((current) => !current)}
            type="button"
          >
            {showAll ? 'Show less' : 'View all'}
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-1 flex-col justify-center">
        <CarouselRow hideScrollbar label="Top verified voices" rows={2}>
          {isLoading
            ? Array.from({ length: 12 }, (_, index) => <VoiceCardSkeleton key={index} />)
            : visibleSpeakers.map((speaker) => (
                <FocusableRow key={speaker.id} onClick={() => onSelect(speaker)}>
                  <article className="group flex w-[108px] shrink-0 flex-col rounded-[10px] border border-catalogue-line bg-catalogue-surface-raised p-2 transition-colors hover:border-catalogue-line-strong hover:bg-catalogue-surface-hover">
                    <div className="relative mx-auto w-fit">
                      <CoverImage
                        alt={speaker.avatarAlt}
                        className="size-10 rounded-full object-cover ring-2 ring-catalogue-blue/25"
                        height={40}
                        src={speaker.avatarUrl}
                        width={40}
                      />
                      <span className="absolute -right-2 -top-2">
                        <ScoreBadge score={speaker.score} size="sm" />
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-center text-[11px] font-semibold text-catalogue-ink">
                      {speaker.name}
                    </p>
                    <p className="mt-0.5 flex items-center justify-center gap-1 truncate text-[9px] text-catalogue-muted">
                      <Globe2 aria-hidden="true" className="size-2.5 shrink-0" />
                      {speaker.language} • {speaker.country}
                    </p>
                    <p className="mt-0.5 text-center text-[9px] text-catalogue-dim">
                      {speaker.hours} hrs
                    </p>
                  </article>
                </FocusableRow>
              ))}
        </CarouselRow>
      </div>
    </section>
  );
}
