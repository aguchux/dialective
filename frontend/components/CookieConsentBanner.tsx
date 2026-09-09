'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';

const CONSENT_STORAGE_KEY = 'dialectiva_cookie_consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CONSENT_STORAGE_KEY)) setVisible(true);
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies) --
      // in that case just skip the banner rather than show it forever.
    }
  }, []);

  const acknowledge = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, '1');
    } catch {
      /* nothing to persist to if storage is unavailable */
    }
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-[rgba(5,5,5,0.1)] bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(5,5,5,0.08)] md:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-[rgba(5,5,5,0.78)]">
            We use a strictly necessary session cookie to keep you signed in. We don&apos;t use
            advertising or tracking cookies. See our{' '}
            <Link href="/cookies" className="font-semibold text-accent underline underline-offset-2">
              Cookie Policy
            </Link>{' '}
            for details.
          </p>
        </div>
        <button
          onClick={acknowledge}
          className="min-h-11 shrink-0 rounded-md bg-accent px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-dark"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
