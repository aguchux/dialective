'use client';

import { useEffect, useState } from 'react';

/**
 * Live payment countdown, shown to BOTH parties on an open trade.
 *
 * The deadline is real: an unpaid trade is cancelled when it elapses and its
 * offer goes back on the market (see P2PService.expireStaleRecords). The
 * sweep runs on P2P traffic rather than a cron, so a trade can sit a little
 * past zero before it is actually resolved -- hence "cancelling now" once it
 * runs out rather than a claim it is already gone.
 *
 * Ticks once a second from a single interval; no work when the trade is not
 * awaiting payment, since the caller unmounts it.
 */

function segments(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function PaymentCountdown({
  deadline,
  isSeller,
  compact = false,
}: {
  deadline: string;
  isSeller: boolean;
  compact?: boolean;
}) {
  // Start at null so server and first client render agree -- computing a
  // remaining time during SSR would mismatch on hydration.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(deadline).getTime();
    if (Number.isNaN(target)) return;
    const tick = () => setRemainingMs(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (remainingMs === null) return null;

  const overdue = remainingMs <= 0;
  const value = segments(Math.floor(Math.abs(remainingMs) / 1000));

  if (compact) {
    return (
      <span
        className={`font-mono text-xs font-bold tabular-nums ${
          overdue ? 'text-[#a3242f]' : 'text-ink'
        }`}
        title={overdue ? 'Out of time -- this trade is being cancelled' : 'Time left to pay'}
      >
        {overdue ? `+${value} overdue` : value}
      </span>
    );
  }

  return (
    <p className={`text-sm ${overdue ? 'font-bold text-[#a3242f]' : 'text-muted'}`}>
      {overdue ? (
        <>
          Out of time by <span className="font-mono tabular-nums">{value}</span>
          {isSeller
            ? ' — this trade is being cancelled and your DL returned. Your post goes back on the market.'
            : ' — this trade is being cancelled. If you have already paid, mark it paid now.'}
        </>
      ) : (
        <>
          {isSeller ? 'Buyer has ' : 'Time left to pay: '}
          <span className="font-mono font-bold tabular-nums">{value}</span>
          {isSeller ? ' left to pay' : ''}
        </>
      )}
    </p>
  );
}
