'use client';

import { ChevronRight, Globe2 } from 'lucide-react';
import type { VerifiedSpeaker } from './types';
import { CoverImage, FocusableRow, ScoreBadge } from './primitives';

export function VerifiedVoices({
  onSelect,
  speakers,
}: {
  onSelect: (speaker: VerifiedSpeaker) => void;
  speakers: VerifiedSpeaker[];
}) {
  return (
    <section className="min-w-0" id="voice-library">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-catalogue-ink sm:text-base">
          Top Verified Voices
        </h2>
        <button
          aria-label="View all verified voices"
          className="grid size-7 place-items-center rounded-full text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
          type="button"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="stream-catalogue-scrollbar mt-2 flex min-w-0 gap-2 overflow-x-auto pb-1">
        {speakers.map((speaker) => (
          <FocusableRow key={speaker.id} onClick={() => onSelect(speaker)}>
            <article className="relative w-[108px] shrink-0 rounded-[10px] border border-catalogue-line bg-catalogue-surface p-2.5 transition-colors hover:border-catalogue-line-strong hover:bg-catalogue-surface-hover">
              <div className="relative mx-auto w-fit">
                <CoverImage
                  alt={speaker.avatarAlt}
                  className="size-14 rounded-full object-cover ring-2 ring-catalogue-blue/25"
                  height={56}
                  src={speaker.avatarUrl}
                  width={56}
                />
                <span className="absolute -right-1 -top-1">
                  <ScoreBadge score={speaker.score} />
                </span>
              </div>
              <p className="mt-2 truncate text-center text-xs font-semibold text-catalogue-ink">
                {speaker.name}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 truncate text-[10px] text-catalogue-muted">
                <Globe2 aria-hidden="true" className="size-3 shrink-0" />
                {speaker.language} • {speaker.country}
              </p>
              <p className="mt-1 text-center text-[10px] text-catalogue-dim">{speaker.hours} hrs</p>
            </article>
          </FocusableRow>
        ))}
      </div>
    </section>
  );
}
