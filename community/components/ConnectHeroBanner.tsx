'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, X } from 'lucide-react';
import { useGetPlatformPublicSettingsQuery } from '@/store/geo-api';

// Keyed by event year, so rolling the event forward shows the band again to
// someone who dismissed the previous one. sessionStorage, not
// localStorage: a dismissal lasts the session, not forever.
function dismissKey(eventYear: string) {
  return `dialectiva_connect_hero_dismissed_${eventYear}`;
}

/**
 * The DL Connect event hero, full-bleed directly under the Community
 * topbar. Mirrors frontend/components/dashboard/ConnectHeroBanner.tsx --
 * deliberately duplicated rather than shared, since the two apps have
 * separate RTK slices and no common component package, the same way
 * BrandLogo and the notification bell are duplicated here.
 *
 * Everything it renders, including whether it renders at all, comes from
 * admin settings (Settings -> DL Connect).
 */
export function ConnectHeroBanner() {
  const { data } = useGetPlatformPublicSettingsQuery();
  const hero = data?.connectHero;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!hero?.eventYear) return;
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey(hero.eventYear)) === '1');
    } catch {
      /* private browsing / storage disabled -- just don't remember a dismissal */
      setDismissed(false);
    }
  }, [hero?.eventYear]);

  if (!hero?.enabled || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      if (hero) window.sessionStorage.setItem(dismissKey(hero.eventYear), '1');
    } catch {
      /* nothing to persist to if storage is unavailable */
    }
  }

  return (
    <div className="relative w-full overflow-hidden" role="region" aria-label={hero.title}>
      {/* Always painted, so an image that 404s or is still loading degrades
          to the designed fallback rather than to unreadable text. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#123524] via-[#1d5c3c] to-[#2f8f5b]" />
      {hero.imageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
            src={hero.imageUrl}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/30" />
        </>
      )}

      <a
        className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 pr-12 text-white md:px-6 md:py-6"
        href={hero.url}
        rel="noreferrer"
        target="_blank"
      >
        <div className="min-w-0 flex-1">
          {hero.dateLabel && (
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/75">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {hero.dateLabel}
            </p>
          )}
          <p className="mt-1 text-xl font-black leading-tight md:text-2xl">{hero.title}</p>
          {hero.subtitle && (
            <p className="mt-1 text-sm leading-relaxed text-white/85 md:text-base">
              {hero.subtitle}
            </p>
          )}
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2.5 font-bold text-[#123524] transition-colors hover:bg-white/90">
          {hero.ctaLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      </a>

      <button
        aria-label="Dismiss for this session"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
        onClick={dismiss}
        type="button"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
