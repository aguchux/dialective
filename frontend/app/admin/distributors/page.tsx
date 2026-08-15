'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { activityLabels } from '@/components/trainer/TrainerDashboard';
import {
  DistributorActivityEntry,
  DistributorAdminSummary,
  normalizeErrorMessage,
  useCreateDistributorAllocationMutation,
  useGetDistributorActivityQuery,
  useGetDistributorSettingsQuery,
  useListAdminDistributorsQuery,
} from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted';

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

function formatTokens(value: string | number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AdminDistributorsPage() {
  const { data: distributors, isLoading } = useListAdminDistributorsQuery();
  const [creditingDistributor, setCreditingDistributor] = useState<DistributorAdminSummary | null>(null);
  const [activityDistributor, setActivityDistributor] = useState<DistributorAdminSummary | null>(null);

  const columns: DataTableColumn<DistributorAdminSummary>[] = [
    {
      key: 'name',
      header: 'Distributor',
      sortValue: (d) => `${d.name} ${d.email}`,
      render: (d) => (
        <>
          <p className="font-extrabold">{d.name}</p>
          <p className="text-sm text-muted">{d.email}</p>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => d.status,
      render: (d) => <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[d.status]}`}>{d.status}</span>,
    },
    {
      key: 'tokenBalance',
      header: 'DL balance',
      sortValue: (d) => Number(d.tokenBalance),
      render: (d) => (
        <>
          <p className="font-extrabold">{formatTokens(d.tokenBalance)} DL</p>
          {Number(d.lockedBalance) > 0 && <p className="text-xs text-muted">{formatTokens(d.lockedBalance)} DL locked</p>}
        </>
      ),
    },
    {
      key: 'totalCredit',
      header: 'All credit',
      sortValue: (d) => Number(d.totalCredit),
      render: (d) => <span className="font-bold text-accent-dark">+{formatTokens(d.totalCredit)} DL</span>,
    },
    {
      key: 'totalDebit',
      header: 'All debit',
      sortValue: (d) => Number(d.totalDebit),
      render: (d) => <span className="font-bold text-danger">-{formatTokens(d.totalDebit)} DL</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      searchable: false,
      render: (d) => (
        <div className="flex flex-wrap items-center gap-2">
          <button className={secondaryButtonClass} onClick={() => setCreditingDistributor(d)} type="button">
            + Credit
          </button>
          <button className={secondaryButtonClass} onClick={() => setActivityDistributor(d)} type="button">
            View activity
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Distributors</h1>
          <p className="leading-relaxed text-muted">
            Every distributor&rsquo;s DL balance, lifetime credit and debit, bulk allocations, and network activity.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={distributors ?? []}
          rowKey={(d) => d.id}
          isLoading={isLoading}
          emptyMessage="No users have the Distributor role yet."
          searchPlaceholder="Search name or email"
        />
      </div>

      {creditingDistributor && (
        <CreditDistributorDialog distributor={creditingDistributor} onClose={() => setCreditingDistributor(null)} />
      )}
      {activityDistributor && (
        <DistributorActivityDialog distributor={activityDistributor} onClose={() => setActivityDistributor(null)} />
      )}
    </AdminShell>
  );
}

function CreditDistributorDialog({ distributor, onClose }: { distributor: DistributorAdminSummary; onClose: () => void }) {
  const { data: settings } = useGetDistributorSettingsQuery();
  const [allocate, { isLoading: isAllocating }] = useCreateDistributorAllocationMutation();

  const [tokenAmount, setTokenAmount] = useState('1000000');
  const [discountRate, setDiscountRate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const defaultBulkDiscountRate = settings?.defaultBulkDiscountRate ?? '0';
  const effectiveTokenAmount = useMemo(() => {
    const amount = Number(tokenAmount || 0);
    const rate = Number((discountRate || defaultBulkDiscountRate) || 0);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, rate, discountedValue: amount * (1 - rate) };
  }, [tokenAmount, discountRate, defaultBulkDiscountRate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await allocate({
        distributorId: distributor.id,
        tokenAmount: Number(tokenAmount),
        discountRate: discountRate ? Number(discountRate) : undefined,
        note: note.trim() || undefined,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to credit this distributor.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Credit ${distributor.name}`}
        description="Grants a bulk DL allocation, credited to their wallet in full."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          {!settings?.enabled || !settings?.bulkAllocationEnabled ? (
            <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-muted">
              Bulk allocations are currently disabled. Enable them from Settings &rarr; Distributor Settings before
              crediting a distributor.
            </p>
          ) : (
            <>
              <div className="grid gap-1">
                <label className="text-xs font-bold uppercase text-muted" htmlFor="credit-token-amount">
                  DL tokens
                </label>
                <input
                  className={inputClass}
                  id="credit-token-amount"
                  min="0.00000001"
                  onChange={(e) => setTokenAmount(e.target.value)}
                  required
                  step="any"
                  type="number"
                  value={tokenAmount}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-bold uppercase text-muted" htmlFor="credit-discount-rate">
                  Discount rate
                </label>
                <input
                  className={inputClass}
                  id="credit-discount-rate"
                  max="1"
                  min="0"
                  onChange={(e) => setDiscountRate(e.target.value)}
                  placeholder={defaultBulkDiscountRate}
                  step="0.0001"
                  type="number"
                  value={discountRate}
                />
              </div>
              {effectiveTokenAmount && (
                <div className="grid gap-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
                  <p className="text-muted">{effectiveTokenAmount.amount.toLocaleString()} DL is credited to the wallet in full.</p>
                  {effectiveTokenAmount.rate > 0 && (
                    <p className="font-bold">
                      At a {(effectiveTokenAmount.rate * 100).toFixed(2)}% discount, that&rsquo;s worth{' '}
                      {effectiveTokenAmount.discountedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} DL to
                      invoice off-platform &mdash; a record for your own accounting, not a charge collected here.
                    </p>
                  )}
                </div>
              )}
              <div className="grid gap-1">
                <label className="text-xs font-bold uppercase text-muted" htmlFor="credit-note">
                  Note
                </label>
                <textarea className={`${inputClass} min-h-24`} id="credit-note" onChange={(e) => setNote(e.target.value)} value={note} />
              </div>
            </>
          )}

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className={primaryButtonClass}
              disabled={!settings?.enabled || !settings?.bulkAllocationEnabled}
              pending={isAllocating}
              pendingLabel="Crediting"
              type="submit"
            >
              Credit distributor
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DistributorActivityDialog({ distributor, onClose }: { distributor: DistributorAdminSummary; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading } = useGetDistributorActivityQuery({ distributorId: distributor.id, page, pageSize });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${distributor.name}'s activity`}
        description="Every transaction against this distributor's wallet -- bulk allocations, referral bonuses at every level, P2P sales, and withdrawals."
      >
        <div className="grid gap-3">
          {isLoading && <p className="text-muted">Loading...</p>}
          {!isLoading && (!data || data.items.length === 0) && <p className="text-sm text-muted">No transactions yet.</p>}
          {!isLoading && data && data.items.length > 0 && (
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-96 text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-bold uppercase text-muted">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <ActivityRow entry={entry} key={entry.id} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-sm text-muted">
                Page {data.page} of {data.totalPages} &middot; {data.total} total
              </p>
              <div className="flex gap-2">
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted">
              Close
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivityRow({ entry }: { entry: DistributorActivityEntry }) {
  const isCredit = Number(entry.amount) >= 0;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2 pr-3 text-muted">{new Date(entry.createdAt).toLocaleString()}</td>
      <td className="py-2 pr-3 font-bold">{activityLabels[entry.type]}</td>
      <td className={`py-2 font-bold ${isCredit ? 'text-accent-dark' : 'text-danger'}`}>
        {isCredit ? '+' : ''}
        {formatTokens(entry.amount)} DL
      </td>
    </tr>
  );
}
