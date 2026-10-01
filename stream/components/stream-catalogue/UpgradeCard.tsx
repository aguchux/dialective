'use client';

import { useEffect, useState } from 'react';
import { Plus, SlidersHorizontal, X } from 'lucide-react';

const DISMISSED_KEY = 'stream.sidebar.upgradeCardDismissed';

/**
 * The upgrade prompt above the account row, dismissible for good.
 *
 * It is a promotion, not a control: the account menu directly below it
 * already carries a working "Upgrade plan" entry, so dismissing this loses
 * nothing. That is the reason it can be closed at all -- a nav item would
 * not be safe to hide this way.
 *
 * The dismissal is per browser, not per account: it lives in localStorage
 * rather than on the member record, because it is a display preference and
 * does not justify a schema column plus an endpoint. The tradeoff is that
 * it reappears on another device, which is the right failure direction for
 * a prompt -- a stale dismissal that silently hides an upsell forever on a
 * teammate's machine would be worse than showing it once more.
 *
 * It renders nothing until the stored value has been read. Rendering the
 * card first and hiding it in an effect would flash it on every load for
 * someone who had already dismissed it, which reads as the dismissal not
 * having worked.
 */
export function UpgradeCard({ onViewPlans }: { onViewPlans: () => void }) {
  // undefined = not yet read from storage, so render nothing.
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Private windows and blocked site data throw on access rather than
    // returning null, so a failed read degrades to showing the card.
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Dismissed for this session regardless; it returns on reload.
    }
  }

  if (dismissed !== false) return null;

  return (
    <div className="relative mx-4 mt-3 shrink-0 overflow-hidden rounded-[10px] border border-catalogue-blue/30 bg-[linear-gradient(145deg,#33244a,#1a1424)] p-4">
      <SlidersHorizontal
        aria-hidden="true"
        className="absolute -bottom-2 -right-1 size-20 text-catalogue-blue/20"
      />
      <button
        aria-label="Dismiss upgrade prompt"
        className="absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-md text-catalogue-dim transition-colors hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
      <p className="relative pr-6 text-sm font-bold text-catalogue-ink">Upgrade Plan</p>
      <p className="relative mt-1 text-xs leading-relaxed text-catalogue-muted">
        Unlock more hours, advanced filters, and team features.
      </p>
      <button
        className="relative mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-catalogue-blue/50 px-2.5 text-[11px] font-semibold text-catalogue-blue-bright transition-colors hover:bg-catalogue-blue/15"
        onClick={onViewPlans}
        type="button"
      >
        View Plans <Plus aria-hidden="true" className="size-3" />
      </button>
    </div>
  );
}
