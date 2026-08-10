'use client';

import { FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { formatCompactNumber, formatCompactUsd } from '@/lib/format';
import {
  SubscriptionPool,
  normalizeErrorMessage,
  useCloseSubscriptionPoolMutation,
  useCreateSubscriptionPoolMutation,
  useDeleteSubscriptionPoolMutation,
  useGetPoolsSummaryQuery,
  useListSubscriptionPoolsQuery,
  useUpdateSubscriptionPoolMutation,
} from '@/store/api';

const summaryIconBg: Record<string, string> = {
  available: 'bg-[#e6f7ef] text-[#1AAE5C]',
  availableUsd: 'bg-[#e8f0fe] text-[#3B6DF0]',
  activePools: 'bg-[#efe8fe] text-[#7B3BF0]',
  settled: 'bg-[#fff3e0] text-[#D98A0D]',
};

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminPoolsPage() {
  const { data: summary, isLoading: isLoadingSummary, isError: isSummaryError, error: summaryError } = useGetPoolsSummaryQuery();
  const { data: pools, isLoading: isLoadingPools } = useListSubscriptionPoolsQuery();
  const [closePool, { isLoading: isClosing }] = useCloseSubscriptionPoolMutation();
  const [deletePool] = useDeleteSubscriptionPoolMutation();

  const [editingPool, setEditingPool] = useState<SubscriptionPool | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const availableTokens = summary ? Number(summary.totalAvailableTokens) : null;

  const cards = [
    {
      key: 'available',
      label: 'Reward Pool Available',
      value: availableTokens !== null ? `${formatCompactNumber(availableTokens)} tokens` : '-',
      negative: availableTokens !== null && availableTokens < 0,
    },
    {
      key: 'availableUsd',
      label: 'Total Subscriber Funding',
      value: summary ? formatCompactUsd(summary.totalAvailableUsd) : '-',
    },
    {
      key: 'activePools',
      label: 'Active Subscription Pools',
      value: summary ? summary.activePoolCount.toLocaleString() : '-',
    },
    {
      key: 'settled',
      label: 'Total Settled Payouts',
      value: summary ? `${formatCompactNumber(summary.totalSettledTokens)} tokens` : '-',
    },
  ];

  async function handleClose(id: string) {
    setRowError(null);
    setClosingId(id);
    try {
      await closePool(id).unwrap();
    } catch (err) {
      setRowError(normalizeErrorMessage(err, 'Unable to close this subscription pool.'));
    } finally {
      setClosingId(null);
    }
  }

  async function handleDelete(id: string) {
    setRowError(null);
    setDeletingId(id);
    try {
      await deletePool(id).unwrap();
    } catch (err) {
      setRowError(normalizeErrorMessage(err, 'Unable to delete this subscription pool.'));
    } finally {
      setDeletingId(null);
    }
  }

  const columns: DataTableColumn<SubscriptionPool>[] = [
    {
      key: 'subscriber',
      header: 'Subscriber',
      sortValue: (p) => p.subscriberName,
      render: (p) => (
        <div>
          <p className="font-extrabold">
            {p.subscriberName}
            {p.organization && <span className="font-medium text-muted"> &middot; {p.organization}</span>}
          </p>
          <p className="text-sm text-muted">
            {p.subscriberEmail}
            {p.note && <> &middot; {p.note}</>}
          </p>
        </div>
      ),
    },
    {
      key: 'usdAmount',
      header: 'Amount (USD)',
      sortValue: (p) => Number(p.usdAmount),
      render: (p) => `$${Number(p.usdAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (p) => p.status,
      render: (p) => (
        <span
          className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${
            p.status === 'ACTIVE' ? 'bg-accent-soft text-accent-dark' : 'bg-surface-muted text-muted'
          }`}
        >
          {p.status === 'ACTIVE' ? 'Active' : 'Closed'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButtonClass} onClick={() => setEditingPool(p)} type="button">
            Edit
          </button>
          {p.status === 'ACTIVE' && (
            <ActionButton
              className={secondaryButtonClass}
              onClick={() => handleClose(p.id)}
              pending={isClosing && closingId === p.id}
              pendingLabel="Closing"
              type="button"
            >
              Close
            </ActionButton>
          )}
          <ActionButton
            className={dangerButtonClass}
            onClick={() => handleDelete(p.id)}
            pending={deletingId === p.id}
            pendingLabel="Deleting"
            type="button"
          >
            Delete
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Reward Pool</h1>
          <p className="leading-relaxed text-muted">
            The Reward Pool is funded by data subscribers, not trainers. Every active subscription pool sums into
            the total available balance, which funds scored training-payout bonuses. This is never shown to
            trainers directly.
          </p>
        </div>

        {isSummaryError && (
          <p className="leading-relaxed text-danger" role="alert">
            {normalizeErrorMessage(summaryError, 'Unable to load reward pool metrics.')}
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Reward pool stats">
          {cards.map((card) => (
            <div className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]" key={card.key}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-muted">{card.label}</p>
                <span className={`grid size-9 place-items-center rounded-full ${summaryIconBg[card.key]}`}>
                  <PoolStatIcon />
                </span>
              </div>
              <p className={`text-3xl font-black ${card.negative ? 'text-danger' : ''}`}>
                {isLoadingSummary ? '...' : card.value}
              </p>
              {card.negative && (
                <p className="text-sm font-bold text-danger">Pool is running negative -- open more subscriptions.</p>
              )}
            </div>
          ))}
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl leading-snug">Subscription pools</h2>
            <CreatePoolDialog />
          </div>

          {rowError && (
            <p className="leading-relaxed text-danger" role="alert">
              {rowError}
            </p>
          )}

          <DataTable
            columns={columns}
            rows={pools?.items ?? []}
            rowKey={(p) => p.id}
            isLoading={isLoadingPools}
            emptyMessage="No subscription pools opened yet."
          />
        </section>

        {editingPool && <EditPoolDialog pool={editingPool} onClose={() => setEditingPool(null)} />}
      </div>
    </AdminShell>
  );
}

function CreatePoolDialog() {
  const [open, setOpen] = useState(false);
  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createPool, { isLoading }] = useCreateSubscriptionPoolMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createPool({
        subscriberName,
        subscriberEmail,
        organization: organization || undefined,
        usdAmount: Number(usdAmount),
        note: note || undefined,
      }).unwrap();
      setSubscriberName('');
      setSubscriberEmail('');
      setOrganization('');
      setUsdAmount('');
      setNote('');
      setOpen(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to open this subscription pool.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={primaryButtonClass}>+ Open pool</DialogTrigger>
      <DialogContent title="Open a subscription pool" description="Record a data-buying subscriber's payment. The amount is added to the total reward pool available.">
        <PoolForm
          error={error}
          isLoading={isLoading}
          note={note}
          onNoteChange={setNote}
          onOrganizationChange={setOrganization}
          onSubmit={handleSubmit}
          onSubscriberEmailChange={setSubscriberEmail}
          onSubscriberNameChange={setSubscriberName}
          onUsdAmountChange={setUsdAmount}
          organization={organization}
          submitLabel="Open pool"
          submitPendingLabel="Opening"
          subscriberEmail={subscriberEmail}
          subscriberName={subscriberName}
          usdAmount={usdAmount}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditPoolDialog({ pool, onClose }: { pool: SubscriptionPool; onClose: () => void }) {
  const [subscriberName, setSubscriberName] = useState(pool.subscriberName);
  const [subscriberEmail, setSubscriberEmail] = useState(pool.subscriberEmail);
  const [organization, setOrganization] = useState(pool.organization ?? '');
  const [usdAmount, setUsdAmount] = useState(pool.usdAmount);
  const [note, setNote] = useState(pool.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [updatePool, { isLoading }] = useUpdateSubscriptionPoolMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updatePool({
        id: pool.id,
        body: {
          subscriberName,
          subscriberEmail,
          organization: organization || undefined,
          usdAmount: Number(usdAmount),
          note: note || undefined,
        },
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this subscription pool.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Edit subscription pool" description="Update this subscriber's recorded payment.">
        <PoolForm
          error={error}
          isLoading={isLoading}
          note={note}
          onNoteChange={setNote}
          onOrganizationChange={setOrganization}
          onSubmit={handleSubmit}
          onSubscriberEmailChange={setSubscriberEmail}
          onSubscriberNameChange={setSubscriberName}
          onUsdAmountChange={setUsdAmount}
          organization={organization}
          submitLabel="Save changes"
          submitPendingLabel="Saving"
          subscriberEmail={subscriberEmail}
          subscriberName={subscriberName}
          usdAmount={usdAmount}
        />
      </DialogContent>
    </Dialog>
  );
}

interface PoolFormProps {
  subscriberName: string;
  onSubscriberNameChange: (v: string) => void;
  subscriberEmail: string;
  onSubscriberEmailChange: (v: string) => void;
  organization: string;
  onOrganizationChange: (v: string) => void;
  usdAmount: string;
  onUsdAmountChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  error: string | null;
  isLoading: boolean;
  submitLabel: string;
  submitPendingLabel: string;
  onSubmit: (e: FormEvent) => void;
}

function PoolForm({
  subscriberName,
  onSubscriberNameChange,
  subscriberEmail,
  onSubscriberEmailChange,
  organization,
  onOrganizationChange,
  usdAmount,
  onUsdAmountChange,
  note,
  onNoteChange,
  error,
  isLoading,
  submitLabel,
  submitPendingLabel,
  onSubmit,
}: PoolFormProps) {
  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="pool-subscriber-name">
          Subscriber name
        </label>
        <input
          className={inputClass}
          id="pool-subscriber-name"
          onChange={(e) => onSubscriberNameChange(e.target.value)}
          required
          value={subscriberName}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="pool-subscriber-email">
          Subscriber email
        </label>
        <input
          className={inputClass}
          id="pool-subscriber-email"
          onChange={(e) => onSubscriberEmailChange(e.target.value)}
          required
          type="email"
          value={subscriberEmail}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="pool-organization">
          Organization
        </label>
        <input className={inputClass} id="pool-organization" onChange={(e) => onOrganizationChange(e.target.value)} value={organization} />
      </div>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="pool-usd-amount">
          Amount (USD)
        </label>
        <input
          className={inputClass}
          id="pool-usd-amount"
          min="0.01"
          onChange={(e) => onUsdAmountChange(e.target.value)}
          required
          step="0.01"
          type="number"
          value={usdAmount}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="pool-note">
          Note
        </label>
        <textarea className={`${inputClass} min-h-20`} id="pool-note" onChange={(e) => onNoteChange(e.target.value)} value={note} />
      </div>
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
        <ActionButton className={primaryButtonClass} pending={isLoading} pendingLabel={submitPendingLabel} type="submit">
          {submitLabel}
        </ActionButton>
      </div>
    </form>
  );
}

function PoolStatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.2-1 1.8-3 2.3-3 1.1-3 2.3 1.3 2.2 3 2.2 3-1.1 3-2.5" strokeLinecap="round" />
    </svg>
  );
}
