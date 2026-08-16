'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { activityLabels } from '@/components/trainer/TrainerDashboard';
import {
  normalizeErrorMessage,
  useDeleteUserMutation,
  useGetAdminUserQuery,
  useGetPlatformSettingsQuery,
  useGetUserActivityQuery,
  useLockUserMutation,
  useRequestUserDeleteOtpMutation,
  useRequestUserLockOtpMutation,
  type UserActivityEntry,
} from '@/store/api';

const inputClass = 'min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

function formatTokens(value: string | number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = params.id;
  const selfId = session?.user?.id;

  const { data: user, isLoading } = useGetAdminUserQuery(userId);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: activity, isLoading: isLoadingActivity } = useGetUserActivityQuery({ userId, page, pageSize });

  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Name not provided' : '';

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Link className="text-sm font-bold text-accent hover:text-accent-dark" href="/admin/users">
            &larr; Users
          </Link>
          <h1 className="text-3xl font-black">{isLoading ? 'Loading...' : displayName}</h1>
          {user && <p className="leading-relaxed text-muted">{user.email}</p>}
        </div>

        {user && (
          <>
            <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)] md:grid-cols-2 lg:grid-cols-3">
              <Field label="Role" value={user.role} />
              <Field label="Status" value={<span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[user.status]}`}>{user.status}</span>} />
              <Field label="DL balance" value={<span className="font-mono text-lg text-accent-dark">{formatTokens(user.walletBalance ?? 0)} DL</span>} />
              <Field label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
              <Field label="Phone" value={user.phoneNumber ?? 'Not set'} />
              <Field label="Phone verified" value={user.phoneVerified ? 'Yes' : 'No'} />
              <Field label="Onboarding complete" value={user.onboardingComplete ? 'Yes' : 'No'} />
              <Field label="Referral code" value={user.referralCode} />
              <Field label="Dialect" value={user.dialectTag ?? 'Not set'} />
              <Field label="User ID" value={<span className="break-all font-mono text-xs">{user.id}</span>} />
            </section>

            <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <h2 className="text-lg font-black">Account controls</h2>
              {user.id === selfId ? (
                <p className="text-sm text-muted">You cannot lock or delete your own account.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-[#8a4b0f] transition-colors hover:bg-[#fff3e0]"
                    onClick={() => setLockDialogOpen(true)}
                    type="button"
                  >
                    {user.status === 'ACTIVE' ? 'Lock account' : 'Change lock status'}
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8]"
                    onClick={() => setDeleteDialogOpen(true)}
                    type="button"
                  >
                    Delete user
                  </button>
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted">
                Locking suspends or blocks the account, revokes active sessions, rejects any pending withdrawal, and cancels open P2P
                trades &mdash; reversible from this page. Deleting permanently removes the account and its data; the person can sign up
                again afterward as a brand-new account.
              </p>
            </section>

            <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <h2 className="text-lg font-black">Token transactions</h2>
              {isLoadingActivity && <p className="text-muted">Loading...</p>}
              {!isLoadingActivity && (!activity || activity.items.length === 0) && <p className="text-sm text-muted">No transactions yet.</p>}
              {!isLoadingActivity && activity && activity.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-96 text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs font-bold uppercase text-muted">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.items.map((entry) => (
                        <ActivityRow entry={entry} key={entry.id} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {activity && activity.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                  <p className="text-sm text-muted">
                    Page {activity.page} of {activity.totalPages} &middot; {activity.total} total
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
                      disabled={page >= activity.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {user && lockDialogOpen && (
        <LockUserDialog user={user} onClose={() => setLockDialogOpen(false)} />
      )}
      {user && deleteDialogOpen && (
        <DeleteUserDialog
          user={user}
          onClose={() => setDeleteDialogOpen(false)}
          onDeleted={() => router.push('/admin/users')}
        />
      )}
    </AdminShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function ActivityRow({ entry }: { entry: UserActivityEntry }) {
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

function LockUserDialog({ user, onClose }: { user: { id: string; status: string }; onClose: () => void }) {
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const otpRequired = platformSettings?.adminPayoutOtpEnabled ?? false;

  const [status, setStatus] = useState(user.status === 'ACTIVE' ? 'SUSPENDED' : user.status);
  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestUserLockOtpMutation();
  const [lockUser, { isLoading: isSubmitting }] = useLockUserMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (otpRequired && !otpRequestId) {
        const result = await requestOtp({ id: user.id, status }).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await lockUser({ id: user.id, status, ...(otpRequestId ? { otpRequestId, code } : {}) }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, otpRequestId ? 'Unable to verify this code.' : 'Unable to update this account.'));
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent title="Enter your code" description="We emailed a 6-digit code to confirm this action.">
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
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                disabled={code.length !== 6}
                pending={isSubmitting}
                pendingLabel="Confirming"
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Lock this account" description="Choose the account status to apply.">
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="lock-status">
              Status
            </label>
            <select className={inputClass} id="lock-status" onChange={(e) => setStatus(e.target.value)} value={status}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>
          {status !== 'ACTIVE' && (
            <p className="text-sm leading-relaxed text-muted">
              This revokes active sessions, rejects any pending withdrawal (returning the DL to their wallet), and cancels open P2P
              offers/trades (returning escrowed DL).
            </p>
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
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              pending={isRequestingOtp || isSubmitting}
              pendingLabel={otpRequired ? 'Sending code' : 'Saving'}
              type="submit"
            >
              {otpRequired ? 'Send confirmation code' : 'Confirm'}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: { id: string; email: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const otpRequired = platformSettings?.adminPayoutOtpEnabled ?? false;

  const [confirmText, setConfirmText] = useState('');
  const [code, setCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestUserDeleteOtpMutation();
  const [deleteUser, { isLoading: isSubmitting }] = useDeleteUserMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (otpRequired && !otpRequestId) {
        const result = await requestOtp(user.id).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await deleteUser({ id: user.id, ...(otpRequestId ? { otpRequestId, code } : {}) }).unwrap();
      onDeleted();
    } catch (err) {
      setError(normalizeErrorMessage(err, otpRequestId ? 'Unable to verify this code.' : 'Unable to delete this account.'));
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent title="Enter your code" description="We emailed a 6-digit code to confirm this permanent deletion.">
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
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                disabled={code.length !== 6}
                pending={isSubmitting}
                pendingLabel="Deleting"
                type="submit"
              >
                Permanently delete
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
        title="Delete this user permanently"
        description="This cannot be undone. All wallet, ledger, and activity data for this account is removed. The person can sign up again afterward with a new account."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="confirm-email">
              Type <span className="font-mono">{user.email}</span> to confirm
            </label>
            <input className={inputClass} id="confirm-email" onChange={(e) => setConfirmText(e.target.value)} value={confirmText} />
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
              disabled={confirmText !== user.email}
              pending={isRequestingOtp || isSubmitting}
              pendingLabel={otpRequired ? 'Sending code' : 'Deleting'}
              type="submit"
            >
              {otpRequired ? 'Send confirmation code' : 'Permanently delete'}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
