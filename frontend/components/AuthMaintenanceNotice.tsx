'use client';

import { useCountdown } from '@/lib/use-countdown';

/**
 * Rendered instead of the login/register forms whenever the admin has
 * scheduled auth maintenance (see MaintenanceSettingsPanel). The countdown
 * ticks client-side purely for display -- the backend is the actual source
 * of truth and self-clears authMaintenanceEnabled the moment the scheduled
 * time passes, so once this hits zero a retry of the underlying request
 * will succeed even before this component re-fetches.
 */
export function AuthMaintenanceNotice({ until, note }: { until: string | null; note: string | null }) {
  const countdown = useCountdown(until);

  return (
    <div className="grid gap-4 text-center">
      <div
        className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-warning/15 text-2xl text-warning"
        aria-hidden="true"
      >
        &#9881;
      </div>
      <h1 className="text-[1.75rem] leading-tight">Scheduled maintenance</h1>
      <p className="leading-relaxed text-muted">
        {note || "We're upgrading our systems. Login and signup are temporarily unavailable."}
      </p>
      {until && (
        <div className="grid gap-1 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-bold uppercase tracking-normal text-muted">Back up in</p>
          <p className="text-2xl font-black tabular-nums text-ink">{countdown.label}</p>
          <p className="text-sm text-muted">{new Date(until).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
