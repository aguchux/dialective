'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight, Megaphone, X } from 'lucide-react';
import { useGetBannerUpdatesQuery } from '@/store/api';

const DISMISS_STORAGE_KEY = 'dialectiva_banner_dismissed_id';

export function GlobalMessageBanner() {
  const { status } = useSession();
  return status === 'authenticated' ? <ActiveBanner /> : null;
}

function ActiveBanner() {
  const { data } = useGetBannerUpdatesQuery(undefined, { pollingInterval: 60000 });
  const items = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissedId(window.localStorage.getItem(DISMISS_STORAGE_KEY));
    } catch {
      /* private browsing / storage disabled -- just don't remember a dismissal */
    }
  }, []);

  // New banners keep arriving at index 0 (newest first) -- always land on
  // the newest one rather than preserving whatever index was last browsed,
  // so a fresh push is never missed behind an old position in the slider.
  useEffect(() => {
    setIndex(0);
  }, [items[0]?.id]);

  if (items.length === 0) return null;
  const latestId = items[0].id;
  if (dismissedId === latestId) return null;

  const current = items[Math.min(index, items.length - 1)];

  const dismiss = () => {
    setDismissedId(latestId);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, latestId);
    } catch {
      /* nothing to persist to if storage is unavailable */
    }
  };

  return (
    <div
      role="region"
      aria-label="Announcements"
      className="relative z-[60] w-full bg-accent px-4 py-3 text-white md:px-8"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        <button
          aria-label="Previous announcement"
          className="grid size-8 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          disabled={index >= items.length - 1}
          onClick={() => setIndex((i) => Math.min(i + 1, items.length - 1))}
          type="button"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-black uppercase tracking-wide">
            <Megaphone className="size-3.5 shrink-0" aria-hidden="true" />
            {current.title}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-white/90">
            {current.message}
            {current.href && (
              <>
                {' '}
                <Link
                  className="font-bold underline underline-offset-2 hover:text-white"
                  href={current.href}
                >
                  Learn more
                </Link>
              </>
            )}
          </p>
          {items.length > 1 && (
            <p aria-live="polite" className="mt-1 text-xs text-white/70">
              {index + 1} / {items.length}
            </p>
          )}
        </div>

        <button
          aria-label="Next announcement"
          className="grid size-8 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          disabled={index <= 0}
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          type="button"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>

        <button
          aria-label="Dismiss announcement"
          className="grid size-8 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          onClick={dismiss}
          type="button"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
