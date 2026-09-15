'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useGetPublicClientSettingsQuery } from '@/store/api';

// sessionStorage, not localStorage -- deliberately reappears every new login
// session even after being dismissed, unlike GlobalMessageBanner's
// dismiss-until-a-new-item-is-pushed behavior.
const DISMISS_STORAGE_KEY = 'dialectiva_top_banner_dismissed';

export function TopPromoBanner() {
  const { data } = useGetPublicClientSettingsQuery();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === '1');
    } catch {
      /* private browsing / storage disabled -- just don't remember a dismissal */
      setDismissed(false);
    }
  }, []);

  if (!data?.topBannerEnabled || !data.topBannerImageUrl || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      /* nothing to persist to if storage is unavailable */
    }
  }

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={data.topBannerAltText ?? ''}
      className="block w-full"
      src={data.topBannerImageUrl}
    />
  );

  return (
    <div className="relative w-full" role="region" aria-label="Announcement">
      {data.topBannerLearnMoreUrl ? (
        <a href={data.topBannerLearnMoreUrl} rel="noreferrer" target="_blank">
          {image}
        </a>
      ) : (
        image
      )}
      <button
        aria-label="Dismiss for this session"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
        onClick={dismiss}
        type="button"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
