'use client';

import Link from 'next/link';
import { Coins, Info, Lock, TrendingDown, Wallet } from 'lucide-react';
import {
  useGetMyRoyaltiesQuery,
  useGetMyRoyaltyWithdrawalsQuery,
  type RoyaltyWithdrawal,
  type RoyaltyWithdrawalStatus,
} from '@/store/api';
import { formatDuration } from '@/components/vdcl/vdcl-ui';

const cardClass = 'rounded-xl border border-line bg-surface';

/**
 * A contributor's Stream revenue-sharing position.
 *
 * Two figures, and the whole design of this panel is about keeping them apart:
 *
 * **Accrued** is `royaltyBalance` -- settled, final, withdrawable. It only ever
 * goes up (or down because the contributor withdrew it).
 *
 * **This period's usage** is live and provisional. It is NOT money, and this
 * panel deliberately shows no expected-DL figure at all: converting usage to an
 * amount needs a revenue pool, and a pool only exists against revenue actually
 * collected. A number here would be exactly the stale promise section 7 of
 * docs/Stream-Revenue-Sharing-Engine.md warns about.
 *
 * The harder thing to communicate is that a contributor's SHARE can fall
 * without them doing anything -- holding 60% of a subscriber's streams on day 3
 * and 20% by day 30 requires only that other contributors' usage grew. The
 * design requires the UI to say that plainly rather than leave someone to
 * discover it when their figure drops, so it is stated in prose, not buried in a
 * tooltip.
 *
 * What is never shown: which organisations streamed the work. Only how many.
 * A contributor learning the identities would learn the platform's customer
 * list, and the mutual-anonymity boundary runs in both directions.
 */
export function RoyaltiesPanel() {
  const { data, isLoading } = useGetMyRoyaltiesQuery();
  // Skipped while the programme is off: the list would be empty anyway, and a
  // second request buys nothing.
  const { data: withdrawals } = useGetMyRoyaltyWithdrawalsQuery(undefined, {
    skip: !data?.enabled,
  });

  if (isLoading) {
    return (
      <div className={`${cardClass} p-5`}>
        <div className="h-4 w-40 animate-pulse rounded bg-line" />
        <div className="mt-4 h-8 w-28 animate-pulse rounded bg-line" />
      </div>
    );
  }

  if (!data?.enabled) {
    return (
      <div className={`${cardClass} p-5`}>
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Stream revenue sharing is not open yet
            </h3>
            <p className="mt-1 text-sm text-muted">
              Once it opens, recordings covered by your licence earn a share of what
              subscribers pay to stream them, and your balance appears here. Nothing is
              owed or missing in the meantime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const period = data.currentPeriod;
  const hasUsage = period.streamCount > 0;

  return (
    <div className="space-y-4">
      {/* Accrued: the real, withdrawable figure. */}
      <div className={`${cardClass} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
              <Coins className="size-4" aria-hidden="true" />
              Royalty balance
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
              {formatDl(data.royaltyBalance)} <span className="text-lg text-muted">DL</span>
            </p>
            <p className="mt-2 text-sm text-muted">
              Earned and final. This is separate from your main DL balance and can only
              be withdrawn &mdash; it is never spent on tasks or traded.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          {data.canWithdraw ? (
            <Link
              href="/dashboard/payout-accounts"
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              <Wallet className="size-4" aria-hidden="true" />
              Withdraw royalties
            </Link>
          ) : (
            <p className="text-sm text-muted">
              Payouts start at{' '}
              <span className="font-medium text-ink">{formatDl(data.minimumPayout)} DL</span>.
              Your balance keeps accruing until it reaches that &mdash; nothing is lost
              while it builds up.
            </p>
          )}
        </div>
      </div>

      {/* This period: usage only, explicitly provisional, explicitly not money. */}
      <div className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">
            This month so far
            <span className="ml-2 font-normal text-muted">{monthLabel(period.periodStart)}</span>
          </h3>
        </div>

        {hasUsage ? (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Streams" value={period.streamCount.toLocaleString()} />
              <Stat label="Recordings used" value={period.recordingsStreamed.toLocaleString()} />
              <Stat
                label="Subscribers"
                value={period.subscriberCount.toLocaleString()}
                hint="How many organisations, never which ones"
              />
              <Stat label="Audio streamed" value={formatDuration(period.totalDurationMs)} />
            </dl>

            {/* The point section 7 insists must be stated plainly. */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-bg p-3">
              <TrendingDown className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <p className="text-sm text-muted">
                <span className="font-medium text-ink">
                  Your share of a month can go down as the month goes on.
                </span>{' '}
                Your earnings are a share of what each subscriber pays, split by how much
                of their streaming was your work. If other contributors are streamed more,
                your share of the same subscriber gets smaller &mdash; even though your own
                streams have not changed. Nothing is deducted; the split simply moves.
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            None of your recordings have been streamed this month yet. Usage appears here as
            subscribers stream your dialect.
          </p>
        )}

        <div className="mt-4 flex items-start gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            These are usage figures, not an amount owed. What a month pays is worked out
            after it closes, from what subscribers actually paid &mdash; so no figure is
            shown here until it is real.
          </p>
        </div>
      </div>

      {withdrawals && withdrawals.length > 0 ? (
        <div className={`${cardClass} p-5`}>
          <h3 className="text-sm font-semibold text-ink">Royalty payouts</h3>
          <ul className="mt-3 divide-y divide-line">
            {withdrawals.map((row: RoyaltyWithdrawal) => (
              <WithdrawalRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</dd>
      {hint ? <p className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</p> : null}
    </div>
  );
}

function WithdrawalRow({ row }: { row: RoyaltyWithdrawal }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div>
        <p className="text-sm font-medium tabular-nums text-ink">
          {formatDl(row.tokenAmount)} DL
          <span className="ml-2 font-normal text-muted">
            &asymp; ${formatDl(row.usdAmount)}
          </span>
        </p>
        <p className="text-xs text-muted">{new Date(row.createdAt).toLocaleDateString()}</p>
        {row.adminNote ? <p className="mt-1 text-xs text-muted">{row.adminNote}</p> : null}
      </div>
      <StatusPill status={row.status} />
    </li>
  );
}

/**
 * Status as form as well as text, so what needs attention reads at a glance.
 * REJECTED is the one a contributor must not misread as lost money -- the DL
 * goes back to their royalty balance, which the label says outright.
 */
function StatusPill({ status }: { status: RoyaltyWithdrawalStatus }) {
  const copy: Record<RoyaltyWithdrawalStatus, { label: string; className: string }> = {
    PENDING: { label: 'Pending', className: 'border-line text-muted' },
    APPROVED: { label: 'Approved', className: 'border-line text-ink' },
    PROCESSING: { label: 'Sending', className: 'border-line text-ink' },
    PAID: { label: 'Paid', className: 'border-emerald-500/40 text-emerald-600' },
    FAILED: { label: 'Failed', className: 'border-amber-500/40 text-amber-600' },
    REJECTED: { label: 'Returned to balance', className: 'border-amber-500/40 text-amber-600' },
  };
  const { label, className } = copy[status];
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

/** Trims trailing zeros from a Decimal(20,8) string without losing precision. */
function formatDl(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function monthLabel(periodStart: string): string {
  const date = new Date(periodStart);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
