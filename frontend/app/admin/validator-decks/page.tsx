'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useAdminApproveValidatorDeckMutation,
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
        <Link className="font-bold text-accent hover:text-accent-dark" href={`/validator/decks/${deck.id}`}>
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
      render: (deck) => <BypassApproveAction deck={deck} />,
      searchable: false,
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Validator Decks</h1>
          <p className="leading-relaxed text-muted">
            Every validator-owned deck across the approval chain. Approving here always
            bypass-approves straight to APPROVED, regardless of which tier the deck is currently
            pending at &mdash; publish stays disabled until Phase 3.
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
      </div>
    </AdminShell>
  );
}

function BypassApproveAction({ deck }: { deck: ValidatorDeckSummary }) {
  const [approve, { isLoading }] = useAdminApproveValidatorDeckMutation();
  const [error, setError] = useState<string | null>(null);

  const isPending =
    deck.status === 'PENDING_L2' || deck.status === 'PENDING_L3' || deck.status === 'PENDING_ADMIN';

  if (!isPending) {
    return <span className="text-xs text-muted">&mdash;</span>;
  }

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
        className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold disabled:opacity-50"
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
