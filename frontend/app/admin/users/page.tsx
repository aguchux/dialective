'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton, ActionSpinner } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  normalizeErrorMessage,
  PublicUser,
  useCreateAdminWalletAdjustmentMutation,
  useCreateTrainingPayoutMutation,
  useGetPlatformSettingsQuery,
  useGetUsersQuery,
  useRequestAdminWalletAdjustmentOtpMutation,
  useRequestTrainingPayoutOtpMutation,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
} from '@/store/api';

const selectClass = 'min-h-9 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold text-ink dark:bg-surface-muted';
const inputClass = 'min-h-9 w-full max-w-xs rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const roleOptions = ['TRAINER', 'DISTRIBUTOR', 'PARTNER', 'ADMIN'] as const;
const statusOptions = ['ACTIVE', 'SUSPENDED', 'BLOCKED'] as const;

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

function formatTokens(value: string | number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function userPerformanceState(user: PublicUser) {
  const onboarded = user.onboardingComplete && !!user.dialectId;
  const taskCount = (user.submissionsCount ?? 0) + (user.wordRecordingsCount ?? 0);
  if (!onboarded) {
    return {
      label: 'Not onboarded',
      className: 'bg-red-500',
      detail: 'No dialect selected',
    };
  }
  if (taskCount === 0) {
    return {
      label: 'Onboarded, no task yet',
      className: 'bg-orange-400',
      detail: '0 tasks submitted',
    };
  }
  return {
    label: 'Onboarded and active',
    className: 'bg-emerald-500',
    detail: `${taskCount.toLocaleString()} task${taskCount === 1 ? '' : 's'} submitted`,
  };
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundingUser, setFundingUser] = useState<PublicUser | null>(null);
  const [debitingUser, setDebitingUser] = useState<PublicUser | null>(null);

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
        <UserIdentityCell selfId={selfId} user={u} />
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
      key: 'walletBalance',
      header: 'DL balance',
      sortValue: (u) => Number(u.walletBalance ?? 0),
      render: (u) => <span className="font-mono font-bold tabular-nums">{formatTokens(u.walletBalance ?? 0)} DL</span>,
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
                + Add DL
              </button>
            )}
            <button
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-red-100"
              onClick={() => setDebitingUser(u)}
              type="button"
            >
              - Debit DL
            </button>
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
          <p className="leading-relaxed text-muted">Manage roles and account status across trainers, distributors, partners, and admins.</p>
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
          searchable={false}
        />
      </div>

      {fundingUser && <AddTokensDialog onClose={() => setFundingUser(null)} user={fundingUser} />}
      {debitingUser && <DebitTokensDialog onClose={() => setDebitingUser(null)} user={debitingUser} />}
    </AdminShell>
  );
}

function UserIdentityCell({ user, selfId }: { user: PublicUser; selfId?: string }) {
  const performance = userPerformanceState(user);
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        aria-label={performance.label}
        className={`mt-1 size-3.5 shrink-0 rounded-full ${performance.className} shadow-[0_0_0_3px_rgba(255,255,255,0.9)]`}
        title={`${performance.label}: ${performance.detail}`}
      />
      <div className="min-w-0">
        <Link className="font-extrabold text-accent no-underline hover:text-accent-dark" href={`/admin/users/${user.id}`}>
          {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Name not provided'}
        </Link>
        <p className="break-all text-sm text-muted">{user.email}</p>
        <p className="text-xs font-bold text-muted">{performance.label} · {performance.detail}</p>
        {user.id === selfId && <p className="text-xs text-muted">This is you</p>}
      </div>
    </div>
  );
}

function DebitTokensDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const otpRequired = platformSettings?.adminPayoutOtpEnabled ?? false;

  const [tokenAmount, setTokenAmount] = useState('');
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestAdminWalletAdjustmentOtpMutation();
  const [adjustWallet, { isLoading: isSubmitting }] = useCreateAdminWalletAdjustmentMutation();

  const availableBalance = Number(user.walletBalance ?? 0);
  const effectiveReference = reference || 'Admin silent debit correction';
  const debitAmount = Number(tokenAmount || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const signedAmount = -Math.abs(debitAmount);
    try {
      if (otpRequired && !otpRequestId) {
        const result = await requestOtp({
          userId: user.id,
          tokenAmount: signedAmount,
          reference: effectiveReference,
        }).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await adjustWallet({
        userId: user.id,
        tokenAmount: signedAmount,
        reference: effectiveReference,
        ...(otpRequestId ? { otpRequestId, code } : {}),
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, otpRequestId ? 'Unable to verify this code.' : 'Unable to debit this wallet.'));
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent title="Enter your code" description="We emailed a 6-digit code to confirm this silent wallet debit.">
          <form className="grid gap-3" onSubmit={handleSubmit}>
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
            {error && <p className="leading-relaxed text-danger" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
                Cancel
              </DialogClose>
              <ActionButton
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={code.length !== 6}
                pending={isSubmitting}
                pendingLabel="Debiting"
                type="submit"
              >
                Confirm debit
              </ActionButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Debit DL from ${[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}`}
        description="Silently removes DL from the user's available balance for correction of mistaken credits. No user notification is sent."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-bold text-muted">
            Available balance: {formatTokens(availableBalance)} DL
          </p>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="debit-token-amount">
              DL amount to debit
            </label>
            <input
              className={inputClass}
              id="debit-token-amount"
              max={availableBalance || undefined}
              min="0.00000001"
              onChange={(e) => setTokenAmount(e.target.value)}
              required
              step="any"
              type="number"
              value={tokenAmount}
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
              placeholder="e.g. Correction for duplicate signup bonus"
              value={reference}
            />
          </div>
          {error && <p className="leading-relaxed text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={debitAmount <= 0 || debitAmount > availableBalance}
              pending={isRequestingOtp || isSubmitting}
              pendingLabel={otpRequired ? 'Sending code' : 'Debiting'}
              type="submit"
            >
              {otpRequired ? 'Send confirmation code' : 'Debit DL silently'}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddTokensDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const otpRequired = platformSettings?.adminPayoutOtpEnabled ?? false;

  const [tokenAmount, setTokenAmount] = useState('');
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestTrainingPayoutOtpMutation();
  const [createPayout, { isLoading: isSubmitting }] = useCreateTrainingPayoutMutation();

  const effectiveReference = reference || 'Manual credit by admin';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (otpRequired && !otpRequestId) {
        const result = await requestOtp({
          userId: user.id,
          tokenAmount: Number(tokenAmount),
          reference: effectiveReference,
        }).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await createPayout({
        userId: user.id,
        tokenAmount: Number(tokenAmount),
        reference: effectiveReference,
        ...(otpRequestId ? { otpRequestId, code } : {}),
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, otpRequestId ? 'Unable to verify this code.' : 'Unable to add DL to this trainer.'));
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent title="Enter your code" description="We emailed a 6-digit code to confirm this payout.">
          <form className="grid gap-3" onSubmit={handleSubmit}>
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
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={code.length !== 6}
                pending={isSubmitting}
                pendingLabel="Confirming"
                type="submit"
              >
                Confirm payout
              </ActionButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Add DL to ${[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}`}
        description="Credits the trainer's wallet directly. Recorded as Admin Funding, separate from training payouts."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="fund-token-amount">
              DL amount
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
              pending={isRequestingOtp || isSubmitting}
              pendingLabel={otpRequired ? 'Sending code' : 'Adding'}
              type="submit"
            >
              {otpRequired ? 'Send confirmation code' : 'Add DL'}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
