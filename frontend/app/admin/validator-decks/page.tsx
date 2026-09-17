'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass } from '@/components/dashboard/shared';
import {
  normalizeErrorMessage,
  useAdminApproveValidatorDeckMutation,
  useAdminArchiveValidatorDeckMutation,
  useAdminCloneFromStreamDeckMutation,
  useAdminPublishValidatorDeckMutation,
  useAdminReassignValidatorDeckMutation,
  useGetAdminValidatorDecksQuery,
  type ValidatorDeckSummary,
} from '@/store/api';

const selectClass =
  'min-h-9 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold text-ink dark:bg-surface-muted';
const inputClass =
  'min-h-9 w-full max-w-xs rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const statusOptions = [
  'DRAFT',
  'PENDING_L2',
  'PENDING_L3',
  'PENDING_ADMIN',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_L2: 'Pending L2 approval',
  PENDING_L3: 'Pending L3 approval',
  PENDING_ADMIN: 'Pending admin approval',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

const statusStyles: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_L2: 'bg-amber-50 text-amber-700',
  PENDING_L3: 'bg-amber-50 text-amber-700',
  PENDING_ADMIN: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  ARCHIVED: 'bg-slate-100 text-slate-700',
};

export default function AdminValidatorDecksPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  const { data: decks, isLoading } = useGetAdminValidatorDecksQuery({
    status: (statusFilter || undefined) as ValidatorDeckSummary['status'] | undefined,
    ownerUserId: ownerFilter.trim() || undefined,
  });

  const columns: DataTableColumn<ValidatorDeckSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (deck) => (
        <Link
          className="font-bold text-accent hover:text-accent-dark"
          href={`/validator/decks/${deck.id}`}
        >
          {deck.name}
        </Link>
      ),
      sortValue: (deck) => deck.name,
    },
    {
      key: 'status',
      header: 'Status',
      render: (deck) => (
        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[deck.status]}`}>
          {STATUS_LABELS[deck.status] ?? deck.status}
        </span>
      ),
      sortValue: (deck) => deck.status,
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (deck) => <span className="break-all font-mono text-xs">{deck.ownerUserId}</span>,
      sortValue: (deck) => deck.ownerUserId,
    },
    {
      key: 'items',
      header: 'Recordings',
      render: (deck) => deck._count.items,
      sortValue: (deck) => deck._count.items,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (deck) => new Date(deck.updatedAt).toLocaleString(),
      sortValue: (deck) => deck.updatedAt,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (deck) => <DeckActions deck={deck} />,
      searchable: false,
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Validator Decks</h1>
          <p className="leading-relaxed text-muted">
            Every validator-owned deck across the approval chain. Bypass-approve advances any
            pending deck straight to APPROVED. Publish bridges an APPROVED deck into a public Stream
            Deck and mints the VALIDATION_REWARD payout for its creator/approvers/any reassignment
            split.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="status-filter">
              Status
            </label>
            <select
              className={selectClass}
              id="status-filter"
              onChange={(e) => setStatusFilter(e.target.value)}
              value={statusFilter}
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="owner-filter">
              Owner user ID
            </label>
            <input
              className={inputClass}
              id="owner-filter"
              onChange={(e) => setOwnerFilter(e.target.value)}
              placeholder="Paste a user ID"
              value={ownerFilter}
            />
          </div>
        </div>

        <DataTable
          adjustablePageSize
          columns={columns}
          emptyMessage="No validator decks match these filters."
          isLoading={isLoading}
          rowKey={(deck) => deck.id}
          rows={decks ?? []}
          searchPlaceholder="Search by name or owner..."
        />

        <CloneFromStreamDeckPanel />
      </div>
    </AdminShell>
  );
}

function DeckActions({ deck }: { deck: ValidatorDeckSummary }) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const isPending =
    deck.status === 'PENDING_L2' || deck.status === 'PENDING_L3' || deck.status === 'PENDING_ADMIN';
  const canReassign = deck.status !== 'PUBLISHED' && deck.status !== 'ARCHIVED';
  const canArchive = deck.status !== 'PUBLISHED' && deck.status !== 'ARCHIVED';

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {isPending && <BypassApproveAction deck={deck} />}
        {deck.status === 'APPROVED' && <PublishAction deck={deck} />}
        {canReassign && (
          <button
            className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold hover:bg-surface-muted dark:bg-surface-muted"
            onClick={() => setReassignOpen(true)}
            type="button"
          >
            Reassign
          </button>
        )}
        {canArchive && <ArchiveAction deck={deck} />}
        {!isPending && deck.status !== 'APPROVED' && !canReassign && !canArchive && (
          <span className="text-xs text-muted">&mdash;</span>
        )}
      </div>
      {reassignOpen && <ReassignDialog deck={deck} onClose={() => setReassignOpen(false)} />}
    </div>
  );
}

function BypassApproveAction({ deck }: { deck: ValidatorDeckSummary }) {
  const [approve, { isLoading }] = useAdminApproveValidatorDeckMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    try {
      await approve(deck.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to approve this deck.'));
    }
  }

  return (
    <div className="grid gap-1">
      <ActionButton
        className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold disabled:opacity-50 dark:bg-surface-muted"
        onClick={handleApprove}
        pending={isLoading}
        pendingLabel="Approving"
        type="button"
      >
        Bypass-approve
      </ActionButton>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

function PublishAction({ deck }: { deck: ValidatorDeckSummary }) {
  const [publish, { isLoading }] = useAdminPublishValidatorDeckMutation();
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setError(null);
    if (
      !window.confirm(
        `Publish "${deck.name}"? This mints DL payouts and bridges it into a public Stream Deck. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await publish(deck.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to publish this deck.'));
    }
  }

  return (
    <div className="grid gap-1">
      <ActionButton
        className="min-h-8 rounded-lg bg-accent px-2.5 text-xs font-extrabold text-white disabled:opacity-50"
        onClick={handlePublish}
        pending={isLoading}
        pendingLabel="Publishing"
        type="button"
      >
        Publish
      </ActionButton>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

function ArchiveAction({ deck }: { deck: ValidatorDeckSummary }) {
  const [archive, { isLoading }] = useAdminArchiveValidatorDeckMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setError(null);
    try {
      await archive(deck.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to archive this deck.'));
    }
  }

  return (
    <div className="grid gap-1">
      <ActionButton
        className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold hover:bg-surface-muted disabled:opacity-50 dark:bg-surface-muted"
        onClick={handleArchive}
        pending={isLoading}
        pendingLabel="Archiving"
        type="button"
      >
        Archive
      </ActionButton>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

function ReassignDialog({ deck, onClose }: { deck: ValidatorDeckSummary; onClose: () => void }) {
  const [newOwnerUserId, setNewOwnerUserId] = useState('');
  const [penaltyPercent, setPenaltyPercent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reassign, { isLoading }] = useAdminReassignValidatorDeckMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newOwnerUserId.trim()) return;
    setError(null);
    try {
      await reassign({
        id: deck.id,
        body: {
          newOwnerUserId: newOwnerUserId.trim(),
          penaltyPercent: penaltyPercent.trim() === '' ? undefined : Number(penaltyPercent),
        },
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reassign this deck.'));
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        className={`${cardClass} grid w-full max-w-sm gap-3 p-5`}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h2 className="text-lg font-black">Reassign &ldquo;{deck.name}&rdquo;</h2>
        <p className="text-sm text-muted">
          Moves ownership to another validator. The current owner keeps (100 &minus; penalty)% of
          the eventual base payout; the new owner gets the penalty% share instead of any other share
          of the base reward or bonuses.
        </p>
        <label className="grid gap-1 text-sm font-bold">
          New owner user ID
          <input
            autoFocus
            className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
            onChange={(e) => setNewOwnerUserId(e.target.value)}
            required
            value={newOwnerUserId}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Penalty percent (optional &mdash; defaults to the platform setting)
          <input
            className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            max={100}
            min={0}
            onChange={(e) => setPenaltyPercent(e.target.value)}
            placeholder="e.g. 30"
            type="number"
            value={penaltyPercent}
          />
        </label>
        {error && <p className="text-sm font-bold text-danger">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            className="min-h-10 rounded-lg border border-line px-3 font-bold"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white disabled:opacity-60"
            disabled={isLoading || !newOwnerUserId.trim()}
            type="submit"
          >
            {isLoading ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CloneFromStreamDeckPanel() {
  const [streamDeckId, setStreamDeckId] = useState('');
  const [targetOwnerUserId, setTargetOwnerUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cloneFromStreamDeck, { isLoading }] = useAdminCloneFromStreamDeckMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!streamDeckId.trim() || !targetOwnerUserId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const deck = await cloneFromStreamDeck({
        streamDeckId: streamDeckId.trim(),
        targetOwnerUserId: targetOwnerUserId.trim(),
      }).unwrap();
      setSuccess(`Cloned into new draft deck "${deck.name}" (${deck.id}).`);
      setStreamDeckId('');
      setTargetOwnerUserId('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to clone this Stream Deck.'));
    }
  }

  return (
    <section className={`${cardClass} grid gap-3 p-5`}>
      <div className="grid gap-1">
        <h2 className="text-lg font-black">Clone from Stream Deck</h2>
        <p className="text-sm text-muted">
          Copies a subscriber-side (B2B) Stream Deck&apos;s current items into a brand-new DRAFT
          validator deck for revalidation. Every copied recording starts UNSCORED.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <label className="grid gap-1 text-sm font-bold">
          Stream Deck ID
          <input
            className={inputClass}
            onChange={(e) => setStreamDeckId(e.target.value)}
            placeholder="Paste a Stream Deck ID"
            required
            value={streamDeckId}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Target validator (owner) user ID
          <input
            className={inputClass}
            onChange={(e) => setTargetOwnerUserId(e.target.value)}
            placeholder="Paste a validator user ID"
            required
            value={targetOwnerUserId}
          />
        </label>
        <button
          className="min-h-9 rounded-lg bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-60"
          disabled={isLoading || !streamDeckId.trim() || !targetOwnerUserId.trim()}
          type="submit"
        >
          {isLoading ? 'Cloning…' : 'Clone'}
        </button>
      </form>
      {error && <p className="text-sm font-bold text-danger">{error}</p>}
      {success && (
        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{success}</p>
      )}
    </section>
  );
}
