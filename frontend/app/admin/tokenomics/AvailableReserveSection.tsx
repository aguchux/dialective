'use client';

import { formatCompactUsd } from '@/lib/format';
import { TokenomicsStatus } from '@/store/api';

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 2x the poll job's 15-minute cadence

const PROVIDER_LABELS: Record<string, string> = {
  flutterwave: 'Flutterwave',
  nowpayments: 'NOWPayments',
};

/**
 * Live Flutterwave + NOWPayments account balances, cached by
 * reserve-balance-poll.ts (every 15 min) into ReserveBalanceSnapshot -- this
 * IS the reserve figure TokenomicsService.getStatus/recalculateValuation now
 * use for the DL/USD rate (replacing the old ReserveTransaction-ledger sum),
 * so this section shows admins exactly what's backing the published rate.
 */
export function AvailableReserveSection({ status }: { status: TokenomicsStatus }) {
  const isStale =
    status.reserveBalancesFetchedAt !== null &&
    Date.now() - new Date(status.reserveBalancesFetchedAt).getTime() > STALE_THRESHOLD_MS;
  const neverPolled = status.reserveBalancesFetchedAt === null;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl leading-snug">Available reserve</h2>
        <p className="text-lg font-extrabold text-ink">
          {formatCompactUsd(status.eligibleReserveUsd)}
        </p>
      </div>
      <p className="leading-relaxed text-muted">
        Live account balances pulled from Flutterwave and NOWPayments every 15 minutes -- this is
        the reserve figure the DL/USD rate is computed against.
      </p>

      {neverPolled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No balance has been polled yet -- the reserve-balance-poll CronJob hasn&apos;t completed
          a successful run. The DL/USD rate is currently based on $0 reserve.
        </p>
      )}
      {!neverPolled && isStale && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The oldest balance was last refreshed{' '}
          {new Date(status.reserveBalancesFetchedAt as string).toLocaleString()} -- the
          reserve-balance-poll CronJob may be failing. Figures below may be stale.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-bold uppercase text-muted">
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">USD value</th>
              <th className="px-4 py-3">Last refreshed</th>
            </tr>
          </thead>
          <tbody>
            {status.reserveBalances.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted" colSpan={5}>
                  No balances polled yet.
                </td>
              </tr>
            )}
            {status.reserveBalances.map((row) => (
              <tr key={`${row.provider}:${row.currency}`} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{PROVIDER_LABELS[row.provider] ?? row.provider}</td>
                <td className="px-4 py-3">{row.currency}</td>
                <td className="px-4 py-3">
                  {row.balanceRaw} {row.currency}
                </td>
                <td className="px-4 py-3">${row.balanceUsd}</td>
                <td className="px-4 py-3">{new Date(row.fetchedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
