'use client';

import { FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { formatCompactNumber, formatCompactUsd } from '@/lib/format';
import {
  ReserveHealthStatus,
  normalizeErrorMessage,
  useBurnTokensMutation,
  useGetTokenomicsStatusQuery,
  useGetValuationHistoryQuery,
  usePauseMintingMutation,
  useRecalculateValuationMutation,
  useResumeMintingMutation,
} from '@/store/api';
import { ValuationChart } from './ValuationChart';
import { ReserveLedgerSection } from './ReserveLedgerSection';
import { TokenOperationsSection } from './TokenOperationsSection';
import { PolicySettingsPanel } from './PolicySettingsPanel';
import { inputClass, primaryButtonClass, secondaryButtonClass } from './shared';

const statCardIconBg: Record<string, string> = {
  value: 'bg-[#e8f0fe] text-[#3B6DF0]',
  reserve: 'bg-[#e6f7ef] text-[#1AAE5C]',
  minted: 'bg-[#efe8fe] text-[#7B3BF0]',
  circulating: 'bg-[#efe8fe] text-[#7B3BF0]',
  redeemable: 'bg-[#efe8fe] text-[#7B3BF0]',
  treasury: 'bg-[#fff3e0] text-[#D98A0D]',
  locked: 'bg-[#fff3e0] text-[#D98A0D]',
  burned: 'bg-[#fde8e8] text-[#D94848]',
  coverage: 'bg-[#e6f7ef] text-[#1AAE5C]',
};

const healthBadgeClass: Record<ReserveHealthStatus, string> = {
  HEALTHY: 'bg-[#e6f7ef] text-[#1AAE5C]',
  WATCH: 'bg-[#fff3e0] text-[#D98A0D]',
  RESTRICTED: 'bg-[#fde8e8] text-[#D94848]',
  CRITICAL: 'bg-[#fde8e8] text-white [background-color:#D94848]',
};

export default function AdminTokenomicsPage() {
  const {
    data: status,
    isLoading: isLoadingStatus,
    isError: isStatusError,
    error: statusError,
  } = useGetTokenomicsStatusQuery();
  const { data: history, isLoading: isLoadingHistory } = useGetValuationHistoryQuery({
    limit: 30,
  });
  const [recalculate, { isLoading: isRecalculating }] = useRecalculateValuationMutation();
  const [pause, { isLoading: isPausing }] = usePauseMintingMutation();
  const [resume, { isLoading: isResuming }] = useResumeMintingMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const cards = [
    {
      key: 'value',
      label: 'DL Reference Value',
      value: status ? formatCompactUsd(status.publishedValueUsd) : '-',
    },
    {
      key: 'reserve',
      label: 'Eligible Reserve',
      value: status ? formatCompactUsd(status.eligibleReserveUsd) : '-',
    },
    {
      key: 'minted',
      label: 'Total Minted',
      value: status ? `${formatCompactNumber(status.supply.totalMinted)} DL` : '-',
    },
    {
      key: 'circulating',
      label: 'Circulating',
      value: status ? `${formatCompactNumber(status.supply.circulating)} DL` : '-',
    },
    {
      key: 'redeemable',
      label: 'Redeemable',
      value: status ? `${formatCompactNumber(status.supply.redeemable)} DL` : '-',
    },
    {
      key: 'treasury',
      label: 'Treasury',
      value: status ? `${formatCompactNumber(status.supply.treasury)} DL` : '-',
    },
    {
      key: 'locked',
      label: 'Locked',
      value: status ? `${formatCompactNumber(status.supply.locked)} DL` : '-',
    },
    {
      key: 'burned',
      label: 'Burned',
      value: status ? `${formatCompactNumber(status.supply.burned)} DL` : '-',
    },
  ];

  async function handleRecalculate() {
    setActionError(null);
    try {
      await recalculate().unwrap();
    } catch (err) {
      setActionError(normalizeErrorMessage(err, 'Unable to recalculate the valuation.'));
    }
  }

  async function handlePauseResume() {
    setActionError(null);
    try {
      if (status?.mintingPaused) {
        await resume().unwrap();
      } else {
        await pause().unwrap();
      }
    } catch (err) {
      setActionError(normalizeErrorMessage(err, 'Unable to update minting status.'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Tokenomics</h1>
          <p className="leading-relaxed text-muted">
            Reserve, supply, and valuation status for the DL token ledger. This tracks the
            reserve/valuation shadow ledger only -- trainer wallet balances are managed separately.
          </p>
        </div>

        {isStatusError && (
          <p className="leading-relaxed text-danger" role="alert">
            {normalizeErrorMessage(statusError, 'Unable to load tokenomics status.')}
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tokenomics stats">
          {cards.map((card) => (
            <div
              className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]"
              key={card.key}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-muted">{card.label}</p>
                <span
                  className={`grid size-9 place-items-center rounded-full ${statCardIconBg[card.key]}`}
                >
                  <StatIcon />
                </span>
              </div>
              <p className="text-3xl font-black">{isLoadingStatus ? '...' : card.value}</p>
            </div>
          ))}

          <div className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-muted">Reserve Coverage</p>
              <span
                className={`grid size-9 place-items-center rounded-full ${statCardIconBg.coverage}`}
              >
                <StatIcon />
              </span>
            </div>
            <p className="text-3xl font-black">
              {isLoadingStatus ||
              status?.coverageRatio === null ||
              status?.coverageRatio === undefined
                ? '-'
                : `${(status.coverageRatio * 100).toFixed(1)}%`}
            </p>
            {status && (
              <span
                className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${healthBadgeClass[status.reserveHealthStatus]}`}
              >
                {status.reserveHealthStatus}
              </span>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl leading-snug">Admin actions</h2>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                className={secondaryButtonClass}
                onClick={handlePauseResume}
                pending={isPausing || isResuming}
                pendingLabel={status?.mintingPaused ? 'Resuming' : 'Pausing'}
                type="button"
              >
                {status?.mintingPaused ? 'Resume minting' : 'Pause minting'}
              </ActionButton>
              <ActionButton
                className={secondaryButtonClass}
                onClick={handleRecalculate}
                pending={isRecalculating}
                pendingLabel="Recalculating"
                type="button"
              >
                Recalculate now
              </ActionButton>
              <BurnDialog />
            </div>
          </div>

          {actionError && (
            <p className="leading-relaxed text-danger" role="alert">
              {actionError}
            </p>
          )}

          {status?.mintingPaused && (
            <p className="leading-relaxed text-danger" role="alert">
              Minting is currently paused.
            </p>
          )}
        </section>

        <ValuationChart history={history} isLoading={isLoadingHistory} />

        <section className="grid gap-4">
          <h2 className="text-2xl leading-snug">Valuation history</h2>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-bold uppercase text-muted">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Raw value</th>
                  <th className="px-4 py-3">Published value</th>
                  <th className="px-4 py-3">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingHistory && (
                  <tr>
                    <td className="px-4 py-3 text-muted" colSpan={4}>
                      Loading...
                    </td>
                  </tr>
                )}
                {!isLoadingHistory && (history?.length ?? 0) === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-muted" colSpan={4}>
                      No valuation snapshots yet.
                    </td>
                  </tr>
                )}
                {history?.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{formatCompactUsd(row.rawValueUsd)}</td>
                    <td className="px-4 py-3">{formatCompactUsd(row.publishedValueUsd)}</td>
                    <td className="px-4 py-3">
                      {row.coverageRatio === null
                        ? '-'
                        : `${(Number(row.coverageRatio) * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <ReserveLedgerSection />

        <TokenOperationsSection />

        <PolicySettingsPanel />
      </div>
    </AdminShell>
  );
}

function BurnDialog() {
  const [open, setOpen] = useState(false);
  const [accountCode, setAccountCode] = useState('treasury');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [burnTokens, { isLoading }] = useBurnTokensMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await burnTokens({
        accountCode,
        amount: Number(amount),
        idempotencyKey: crypto.randomUUID(),
        reason: reason || undefined,
      }).unwrap();
      setAmount('');
      setReason('');
      setOpen(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to burn tokens.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={secondaryButtonClass}>Burn tokens</DialogTrigger>
      <DialogContent
        title="Burn DL tokens"
        description="Permanently removes DL from an account's available balance and moves it into the burn sink. This cannot be undone."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="burn-account-code">
              Account code
            </label>
            <input
              className={inputClass}
              id="burn-account-code"
              onChange={(e) => setAccountCode(e.target.value)}
              placeholder="treasury or user:<id>"
              required
              value={accountCode}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="burn-amount">
              Amount (DL)
            </label>
            <input
              className={inputClass}
              id="burn-amount"
              min="0.00000001"
              onChange={(e) => setAmount(e.target.value)}
              required
              step="any"
              type="number"
              value={amount}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="burn-reason">
              Reason
            </label>
            <textarea
              className={`${inputClass} min-h-20`}
              id="burn-reason"
              onChange={(e) => setReason(e.target.value)}
              value={reason}
            />
          </div>
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton
              className={primaryButtonClass}
              pending={isLoading}
              pendingLabel="Burning"
              type="submit"
            >
              Burn
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.2-1 1.8-3 2.3-3 1.1-3 2.3 1.3 2.2 3 2.2 3-1.1 3-2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
