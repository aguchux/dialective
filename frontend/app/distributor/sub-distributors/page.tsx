'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { formatTokens } from '@/components/distributor/format';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import {
  normalizeErrorMessage,
  useAdjustSubDistributorWalletMutation,
  useCreateSubDistributorAllocationMutation,
  useGetDistributorNetworkQuery,
  useGetDistributorSettingsQuery,
  useListSubDistributorsQuery,
  usePromoteSubDistributorMutation,
  useRequestSubDistributorAdjustmentOtpMutation,
  useUpdateSubDistributorStatusMutation,
  type SubDistributorSummary,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted';

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

export default function SubDistributorsPage() {
  const { data: subDistributors, isLoading } = useListSubDistributorsQuery();
  const [creditingSubDistributor, setCreditingSubDistributor] =
    useState<SubDistributorSummary | null>(null);
  const [statusEditingSubDistributor, setStatusEditingSubDistributor] =
    useState<SubDistributorSummary | null>(null);

  const columns: DataTableColumn<SubDistributorSummary>[] = [
    {
      key: 'name',
      header: 'Sub-distributor',
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
      render: (d) => (
        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[d.status]}`}>
          {d.status}
        </span>
      ),
    },
    {
      key: 'tokenBalance',
      header: 'DL balance',
      sortValue: (d) => Number(d.tokenBalance),
      render: (d) => (
        <>
          <p className="font-extrabold">{formatTokens(d.tokenBalance)} DL</p>
          {Number(d.lockedBalance) > 0 && (
            <p className="text-xs text-muted">{formatTokens(d.lockedBalance)} DL locked</p>
          )}
        </>
      ),
    },
    {
      key: 'totalCredit',
      header: 'All credit',
      sortValue: (d) => Number(d.totalCredit),
      render: (d) => (
        <span className="font-bold text-accent-dark">+{formatTokens(d.totalCredit)} DL</span>
      ),
    },
    {
      key: 'totalDebit',
      header: 'All debit',
      sortValue: (d) => Number(d.totalDebit),
      render: (d) => (
        <span className="font-bold text-danger">-{formatTokens(d.totalDebit)} DL</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      searchable: false,
      render: (d) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={secondaryButtonClass}
            onClick={() => setCreditingSubDistributor(d)}
            type="button"
          >
            Credit / debit
          </button>
          <button
            className={secondaryButtonClass}
            onClick={() => setStatusEditingSubDistributor(d)}
            type="button"
          >
            {d.status === 'ACTIVE' ? 'Suspend' : 'Change status'}
          </button>
          <Link className={secondaryButtonClass} href={`/distributor/sub-distributors/${d.id}`}>
            View activity
          </Link>
        </div>
      ),
    },
  ];

  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-3xl font-black">Sub-distributors</h1>
            <p className="leading-relaxed text-muted">
              Promote a direct referral to sub-distributor, fund them in bulk at a discount, and
              manage their account &mdash; the same tools admin uses on you, scoped to your own
              downline.
            </p>
          </div>
          <PromoteDialog />
        </div>

        <DataTable
          columns={columns}
          rows={subDistributors ?? []}
          rowKey={(d) => d.id}
          isLoading={isLoading}
          emptyMessage="You haven't promoted any sub-distributors yet."
          searchPlaceholder="Search name or email"
        />
      </div>

      {creditingSubDistributor && (
        <AdjustWalletDialog
          subDistributor={creditingSubDistributor}
          onClose={() => setCreditingSubDistributor(null)}
        />
      )}
      {statusEditingSubDistributor && (
        <StatusDialog
          subDistributor={statusEditingSubDistributor}
          onClose={() => setStatusEditingSubDistributor(null)}
        />
      )}
    </DistributorShell>
  );
}

function PromoteDialog() {
  const { data: network } = useGetDistributorNetworkQuery();
  const { data: subDistributors } = useListSubDistributorsQuery();
  const [promote, { isLoading: isPromoting }] = usePromoteSubDistributorMutation();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const subDistributorIds = useMemo(
    () => new Set((subDistributors ?? []).map((d) => d.id)),
    [subDistributors],
  );
  // Only direct referrals (network.tree is level-1 only) not already promoted are eligible.
  const candidates = (network?.tree ?? []).filter((node) => !subDistributorIds.has(node.id));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    try {
      await promote(selectedId).unwrap();
      setOpen(false);
      setSelectedId('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to promote this referral.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger className={primaryButtonClass} type="button">
        + Promote sub-distributor
      </DialogTrigger>
      <DialogContent
        title="Promote to sub-distributor"
        description="Only your own direct referrals are eligible. This takes effect immediately, no approval needed."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-muted">
              None of your direct referrals are eligible right now &mdash; they may already be
              sub-distributors, or you have no direct referrals yet.
            </p>
          ) : (
            <div className="grid gap-1">
              <label className="text-xs font-bold uppercase text-muted" htmlFor="promote-candidate">
                Direct referral
              </label>
              <select
                className={inputClass}
                id="promote-candidate"
                onChange={(e) => setSelectedId(e.target.value)}
                required
                value={selectedId}
              >
                <option value="" disabled>
                  Choose a referral
                </option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
              disabled={!selectedId}
              pending={isPromoting}
              pendingLabel="Promoting"
              type="submit"
            >
              Promote
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustWalletDialog({
  subDistributor,
  onClose,
}: {
  subDistributor: SubDistributorSummary;
  onClose: () => void;
}) {
  const { data: settings } = useGetDistributorSettingsQuery();
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [tokenAmount, setTokenAmount] = useState('');
  const [discountRate, setDiscountRate] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [allocate, { isLoading: isAllocating }] = useCreateSubDistributorAllocationMutation();

  const defaultBulkDiscountRate = settings?.defaultBulkDiscountRate ?? '0';
  const effectiveTokenAmount = useMemo(() => {
    const amount = Number(tokenAmount || 0);
    const rate = Number(discountRate || defaultBulkDiscountRate || 0);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, rate, discountedValue: amount * (1 - rate) };
  }, [tokenAmount, discountRate, defaultBulkDiscountRate]);

  async function handleBulkCredit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await allocate({
        subDistributorId: subDistributor.id,
        tokenAmount: Number(tokenAmount),
        discountRate: discountRate ? Number(discountRate) : undefined,
        note: note.trim() || undefined,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to credit this sub-distributor.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Adjust ${subDistributor.name}'s wallet`}
        description="Bulk-credit at a discount, or make a direct debit -- debits require an emailed confirmation code."
      >
        <div className="inline-flex w-fit rounded-lg border border-line bg-surface p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-extrabold ${direction === 'credit' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            onClick={() => setDirection('credit')}
            type="button"
          >
            Bulk credit
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-extrabold ${direction === 'debit' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            onClick={() => setDirection('debit')}
            type="button"
          >
            Debit
          </button>
        </div>

        {direction === 'credit' ? (
          <form className="grid gap-3" onSubmit={handleBulkCredit}>
            {!settings?.enabled || !settings?.bulkAllocationEnabled ? (
              <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-muted">
                Bulk allocations are currently disabled by admin.
              </p>
            ) : (
              <>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-bold uppercase text-muted"
                    htmlFor="credit-token-amount"
                  >
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
                  <label
                    className="text-xs font-bold uppercase text-muted"
                    htmlFor="credit-discount-rate"
                  >
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
                    <p className="text-muted">
                      {effectiveTokenAmount.amount.toLocaleString()} DL is credited to the wallet in
                      full.
                    </p>
                    {effectiveTokenAmount.rate > 0 && (
                      <p className="font-bold">
                        At a {(effectiveTokenAmount.rate * 100).toFixed(2)}% discount, that&rsquo;s
                        worth{' '}
                        {effectiveTokenAmount.discountedValue.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{' '}
                        DL to invoice off-platform &mdash; a record for your own accounting, not a
                        charge collected here.
                      </p>
                    )}
                  </div>
                )}
                <div className="grid gap-1">
                  <label className="text-xs font-bold uppercase text-muted" htmlFor="credit-note">
                    Note
                  </label>
                  <textarea
                    className={`${inputClass} min-h-24`}
                    id="credit-note"
                    onChange={(e) => setNote(e.target.value)}
                    value={note}
                  />
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
                Credit sub-distributor
              </ActionButton>
            </div>
          </form>
        ) : (
          <DebitForm
            reference={reference}
            setReference={setReference}
            subDistributorId={subDistributor.id}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DebitForm({
  subDistributorId,
  reference,
  setReference,
  onDone,
}: {
  subDistributorId: string;
  reference: string;
  setReference: (value: string) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] =
    useRequestSubDistributorAdjustmentOtpMutation();
  const [adjust, { isLoading: isAdjusting }] = useAdjustSubDistributorWalletMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const signedAmount = -Math.abs(Number(amount));
      if (!otpRequestId) {
        const result = await requestOtp({
          id: subDistributorId,
          amount: signedAmount,
          reference: reference || 'Manual debit',
        }).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await adjust({
        id: subDistributorId,
        amount: signedAmount,
        reference: reference || 'Manual debit',
        otpRequestId,
        code,
      }).unwrap();
      onDone();
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Unable to verify this code.' : 'Unable to debit this sub-distributor.',
        ),
      );
    }
  }

  if (otpRequestId) {
    return (
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <p className="text-sm leading-relaxed text-muted">
          We emailed a 6-digit code to confirm this debit.
        </p>
        <input
          autoFocus
          className={`${inputClass} text-center text-lg font-bold tracking-[0.3em]`}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          required
          value={code}
        />
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
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            disabled={code.length !== 6}
            pending={isAdjusting}
            pendingLabel="Confirming"
            type="submit"
          >
            Confirm debit
          </ActionButton>
        </div>
      </form>
    );
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="debit-token-amount">
          DL tokens to debit
        </label>
        <input
          className={inputClass}
          id="debit-token-amount"
          min="0.00000001"
          onChange={(e) => setAmount(e.target.value)}
          required
          step="any"
          type="number"
          value={amount}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="debit-reference">
          Reference / reason
        </label>
        <input
          className={inputClass}
          id="debit-reference"
          maxLength={120}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. Correction for over-credit"
          value={reference}
        />
      </div>
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
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!amount || Number(amount) <= 0}
          pending={isRequestingOtp}
          pendingLabel="Sending code"
          type="submit"
        >
          Send confirmation code
        </ActionButton>
      </div>
    </form>
  );
}

function StatusDialog({
  subDistributor,
  onClose,
}: {
  subDistributor: SubDistributorSummary;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<string>(
    subDistributor.status === 'ACTIVE' ? 'SUSPENDED' : subDistributor.status,
  );
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, { isLoading }] = useUpdateSubDistributorStatusMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateStatus({ id: subDistributor.id, status }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this account.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Update ${subDistributor.name}'s status`}
        description="Suspending or blocking revokes their active sessions."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="sub-status">
              Status
            </label>
            <select
              className={inputClass}
              id="sub-status"
              onChange={(e) => setStatus(e.target.value)}
              value={status}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>
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
              pending={isLoading}
              pendingLabel="Saving"
              type="submit"
            >
              Confirm
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
