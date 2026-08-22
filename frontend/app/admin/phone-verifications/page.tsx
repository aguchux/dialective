'use client';

import { useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import {
  ManualPhoneVerificationRow,
  ManualPhoneVerificationStatus,
  normalizeErrorMessage,
  useListAdminManualPhoneVerificationsQuery,
  useRejectAdminManualPhoneVerificationMutation,
  useVerifyAdminManualPhoneVerificationMutation,
} from '@/store/api';

const statuses: ('ALL' | ManualPhoneVerificationStatus)[] = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'ALL',
];

export default function AdminPhoneVerificationsPage() {
  const [status, setStatus] = useState<'ALL' | ManualPhoneVerificationStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [verifyRow, setVerifyRow] = useState<ManualPhoneVerificationRow | null>(null);
  const { data, isLoading, isFetching } = useListAdminManualPhoneVerificationsQuery({
    page,
    pageSize: 20,
    ...(status !== 'ALL' ? { status } : {}),
  });
  const rows = data?.items ?? [];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">Phone verifications</h1>
            <p className="mt-2 max-w-4xl text-muted">
              Review WhatsApp manual mobile verification requests.
            </p>
          </div>
          <label className="grid gap-1 text-sm font-bold">
            Status
            <select
              className="min-h-10 rounded-lg border border-line bg-white px-3"
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
              value={status}
            >
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item === 'ALL' ? 'All' : item.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fee</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted" colSpan={7}>
                      Loading requests...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center font-bold text-muted" colSpan={7}>
                      No manual verification requests.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => <RequestRow key={row.id} row={row} onVerify={setVerifyRow} />)
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Page {data?.page ?? page} of {data?.totalPages ?? 1}
              {isFetching ? ' - refreshing' : ''}
            </p>
            <div className="flex gap-2">
              <button
                className="min-h-10 rounded-lg border border-line px-4 font-bold disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-10 rounded-lg border border-line px-4 font-bold disabled:opacity-50"
                disabled={page >= (data?.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <VerifyDialog row={verifyRow} onOpenChange={(open) => !open && setVerifyRow(null)} />
      </div>
    </AdminShell>
  );
}

function RequestRow({
  row,
  onVerify,
}: {
  row: ManualPhoneVerificationRow;
  onVerify: (row: ManualPhoneVerificationRow) => void;
}) {
  const [reject, { isLoading: rejecting }] = useRejectAdminManualPhoneVerificationMutation();
  const [error, setError] = useState<string | null>(null);
  const name = useMemo(
    () => [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email,
    [row.user.email, row.user.firstName, row.user.lastName],
  );

  async function rejectRow() {
    setError(null);
    try {
      await reject(row.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reject request.'));
    }
  }

  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-3">
          <div className="font-black">{name}</div>
          <div className="text-muted">{row.user.email}</div>
        </td>
        <td className="px-4 py-3 font-bold">{row.phoneNumber}</td>
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3">{row.feeTokenAmount} DL</td>
        <td className="px-4 py-3">{row.sentAt ? formatDateTime(row.sentAt) : 'Not marked sent'}</td>
        <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
        <td className="px-4 py-3">
          {row.status === 'PENDING' ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-9 rounded-lg bg-accent px-3 font-bold text-white hover:bg-accent-dark"
                onClick={() => onVerify(row)}
                type="button"
              >
                Verify
              </button>
              <ActionButton
                className="min-h-9 rounded-lg border border-line px-3 font-bold hover:bg-surface-muted disabled:opacity-60"
                onClick={() => void rejectRow()}
                pending={rejecting}
                pendingLabel="Rejecting"
                type="button"
              >
                Reject
              </ActionButton>
            </div>
          ) : (
            <span className="text-muted">No action</span>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td className="px-4 pb-3 text-danger" colSpan={7}>
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

function VerifyDialog({
  row,
  onOpenChange,
}: {
  row: ManualPhoneVerificationRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verify, { isLoading }] = useVerifyAdminManualPhoneVerificationMutation();

  async function submit() {
    if (!row) return;
    setError(null);
    try {
      await verify({ id: row.id, code: code.trim() }).unwrap();
      setCode('');
      onOpenChange(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to verify phone number.'));
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent title="Verify mobile" description="Enter the OTP the user sent to WhatsApp.">
        {row && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
              <div className="font-black">
                {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
                  row.user.email}
              </div>
              <div className="text-muted">{row.phoneNumber}</div>
            </div>
            <label className="grid gap-1.5 text-sm font-bold">
              WhatsApp OTP
              <input
                className="min-h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-accent"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                value={code}
              />
            </label>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">
                {error}
              </p>
            )}
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-60"
              disabled={code.length !== 6}
              onClick={() => void submit()}
              pending={isLoading}
              pendingLabel="Verifying"
              type="button"
            >
              Verify mobile
            </ActionButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: ManualPhoneVerificationStatus }) {
  const styles: Record<ManualPhoneVerificationStatus, string> = {
    PENDING: 'bg-amber-50 text-amber-700',
    VERIFIED: 'bg-emerald-50 text-emerald-700',
    REJECTED: 'bg-red-50 text-red-700',
    EXPIRED: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${styles[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
