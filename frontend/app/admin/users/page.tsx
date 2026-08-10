'use client';

import { FormEvent, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton, ActionSpinner } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  normalizeErrorMessage,
  PublicUser,
  useCreateTrainingPayoutMutation,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
} from '@/store/api';

const selectClass = 'min-h-9 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold text-ink dark:bg-surface-muted';
const inputClass = 'min-h-9 w-full max-w-xs rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const roleOptions = ['TRAINER', 'ADMIN', 'PARTNER'] as const;
const statusOptions = ['ACTIVE', 'SUSPENDED', 'BLOCKED'] as const;

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundingUser, setFundingUser] = useState<PublicUser | null>(null);

  const { data: users, isLoading } = useGetUsersQuery({
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const [updateRole] = useUpdateUserRoleMutation();
  const [updateStatus] = useUpdateUserStatusMutation();

  const selfId = session?.user?.id;

  async function changeRole(id: string, role: string) {
    setError(null);
    setPendingField(`role:${id}`);
    try {
      await updateRole({ id, role }).unwrap();
    } catch (mutationError) {
      setError(normalizeErrorMessage(mutationError, 'Unable to update the user role.'));
    } finally {
      setPendingField(null);
    }
  }

  async function changeStatus(id: string, status: string) {
    setError(null);
    setPendingField(`status:${id}`);
    try {
      await updateStatus({ id, status }).unwrap();
    } catch (mutationError) {
      setError(normalizeErrorMessage(mutationError, 'Unable to update the user status.'));
    } finally {
      setPendingField(null);
    }
  }

  const columns: DataTableColumn<PublicUser>[] = [
    {
      key: 'email',
      header: 'User',
      sortValue: (u) => `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.email}`,
      render: (u) => (
        <>
          <p className="font-extrabold">{[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Name not provided'}</p>
          <p className="text-sm text-muted">{u.email}</p>
          {u.id === selfId && <p className="text-xs text-muted">This is you</p>}
        </>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortValue: (u) => u.role,
      render: (u) => {
        const pending = pendingField === `role:${u.id}`;
        return <div className="flex items-center gap-2"><select aria-busy={pending} className={selectClass} value={u.role} disabled={u.id === selfId || pending} onChange={(e) => changeRole(u.id, e.target.value)}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</select>{pending && <ActionSpinner className="text-accent" />}</div>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (u) => u.status,
      render: (u) => <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[u.status]}`}>{u.status}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => {
        const pending = pendingField === `status:${u.id}`;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-busy={pending} className={selectClass} value={u.status} disabled={u.id === selfId || pending} onChange={(e) => changeStatus(u.id, e.target.value)}>{statusOptions.map((s) => <option key={s} value={s}>{s === 'ACTIVE' ? 'Set active' : s === 'SUSPENDED' ? 'Suspend' : 'Block'}</option>)}</select>
            {pending && <ActionSpinner className="text-accent" />}
            {u.role === 'TRAINER' && (
              <button
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted"
                onClick={() => setFundingUser(u)}
                type="button"
              >
                + Add tokens
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Users</h1>
          <p className="leading-relaxed text-muted">Manage roles and account status across trainers, partners, and admins.</p>
        </div>

        <section className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="search">
              Search name or email
            </label>
            <input
              className={inputClass}
              id="search"
              type="text"
              placeholder="Jane or jane@example.com"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="role-filter">
              Role
            </label>
            <select className={selectClass} id="role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="status-filter">
              Status
            </label>
            <select className={selectClass} id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </section>

        {error && <p className="leading-relaxed text-danger" role="alert">{error}</p>}

        <DataTable
          columns={columns}
          rows={users ?? []}
          rowKey={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No users match these filters."
        />
      </div>

      {fundingUser && <AddTokensDialog onClose={() => setFundingUser(null)} user={fundingUser} />}
    </AdminShell>
  );
}

function AddTokensDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const [tokenAmount, setTokenAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createPayout, { isLoading }] = useCreateTrainingPayoutMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createPayout({
        userId: user.id,
        tokenAmount: Number(tokenAmount),
        reference: reference || `Manual credit by admin`,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to add tokens to this trainer.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Add tokens to ${[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}`}
        description="Credits the trainer's wallet directly. This is recorded as a training payout on their earnings ledger."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="fund-token-amount">
              Token amount
            </label>
            <input
              className={inputClass}
              id="fund-token-amount"
              min="0.00000001"
              onChange={(e) => setTokenAmount(e.target.value)}
              required
              step="any"
              type="number"
              value={tokenAmount}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="fund-reference">
              Reference / reason
            </label>
            <input
              className={inputClass}
              id="fund-reference"
              maxLength={120}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Manual correction for missed payout"
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
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              pending={isLoading}
              pendingLabel="Adding"
              type="submit"
            >
              Add tokens
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
