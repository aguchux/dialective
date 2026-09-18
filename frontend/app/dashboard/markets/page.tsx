'use client';

import { Suspense } from 'react';
import { TrainerDashboard } from '@/components/trainer/TrainerDashboard';

/**
 * The trainer's market, as a real route rather than /dashboard?view=market.
 *
 * A query param made the market a mode of the dashboard page, which meant
 * the offer detail page had nowhere firm to send someone back to and the
 * ?accept= hand-off had to be appended to an existing query string. As its
 * own URL it is linkable, shareable and unambiguous. Rendered through
 * TrainerDashboard with the view pinned so it keeps the dashboard chrome
 * (header, nav, banners) instead of duplicating it.
 */
export default function TrainerMarketsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <TrainerDashboard forcedView="market" />
    </Suspense>
  );
}
