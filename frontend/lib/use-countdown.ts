'use client';

import { useEffect, useState } from 'react';

export interface Countdown {
  totalMs: number;
  elapsed: boolean;
  label: string;
}

function formatCountdown(totalMs: number): string {
  if (totalMs <= 0) return 'any moment now';
  const totalSeconds = Math.ceil(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Ticks once a second toward `targetIso`. Used by both the admin maintenance
 * panel (to show how long a scheduled window has left) and the login/
 * signup pages (to show visitors when auth comes back). Returns
 * elapsed:true once the target passes -- callers decide what "elapsed"
 * means for them (the backend is the actual source of truth: it clears
 * authMaintenanceEnabled server-side the next time any auth route checks
 * it, this hook just avoids showing a stale/negative countdown client-side
 * in the few seconds before that next check happens).
 */
export function useCountdown(targetIso: string | null | undefined): Countdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!targetIso) {
    return { totalMs: 0, elapsed: true, label: '' };
  }

  const target = new Date(targetIso).getTime();
  const totalMs = target - now;
  return { totalMs, elapsed: totalMs <= 0, label: formatCountdown(totalMs) };
}
