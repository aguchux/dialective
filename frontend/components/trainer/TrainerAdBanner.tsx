'use client';

import { useEffect, useId, useRef } from 'react';
import { useGetPublicClientSettingsQuery } from '@/store/api';

/** Loads the dedicated 728x90 unit when its public ad-unit configuration exists. */
export function TrainerAdBanner({ slot }: { slot: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId().replace(/:/g, '');
  const { data: settings } = useGetPublicClientSettingsQuery();
  const scriptUrl = settings?.trainerAdsterra728?.scriptUrl;
  const key = settings?.trainerAdsterra728?.key;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !scriptUrl || !key) return;

    const atOptions = { key, format: 'iframe', height: 90, width: 728, params: {} };
    (window as Window & { atOptions?: typeof atOptions }).atOptions = atOptions;
    const script = document.createElement('script');
    script.id = `dialect-library-trainer-adsterra-728x90-${slot}-${instanceId}`;
    script.async = true;
    script.src = scriptUrl;
    container.appendChild(script);

    return () => {
      script.remove();
      delete (window as Window & { atOptions?: typeof atOptions }).atOptions;
    };
  }, [instanceId, key, scriptUrl, slot]);

  if (!scriptUrl || !key) return null;
  return (
    <aside
      className="my-5 flex min-h-[90px] justify-center overflow-hidden"
      aria-label="Advertisement"
    >
      <div ref={containerRef} className="h-[90px] w-full max-w-[728px] overflow-hidden" />
    </aside>
  );
}
