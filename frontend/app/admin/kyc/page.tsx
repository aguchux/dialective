'use client';

import { useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import {
  KycStatus,
  KycVerification,
  normalizeErrorMessage,
  useGetKycVerificationQuery,
  useListKycVerificationsQuery,
  useRefreshKycVerificationMutation,
} from '@/store/api';

const statuses: ('ALL' | KycStatus)[] = [
  'IN_PROGRESS',
  'IN_REVIEW',
  'APPROVED',
  'DECLINED',
  'ABANDONED',
  'EXPIRED',
  'NOT_STARTED',
  'ALL',
];

export default function AdminKycPage() {
  const [status, setStatus] = useState<'ALL' | KycStatus>('IN_REVIEW');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useListKycVerificationsQuery({
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
            <h1 className="text-3xl font-black">Identity verification</h1>
            <p className="mt-2 max-w-4xl text-muted">
              Review Didit ID-scan and selfie verifications. Approve/decline decisions are made by
              Didit -- use this queue for oversight and stuck sessions, not manual approval.
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
                  {item === 'ALL' ? 'All' : item.replace(/_/g, ' ').toLowerCase()}
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
                  <th className="px-4 py-3">Trainer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Face match</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted" colSpan={6}>
                      Loading verifications...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center font-bold text-muted" colSpan={6}>
                      No verifications in this status.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <VerificationRow key={row.id} row={row} onSelect={setSelectedId} />
                  ))
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

        <DetailDialog id={selectedId} onOpenChange={(open) => !open && setSelectedId(null)} />
      </div>
    </AdminShell>
  );
}

function VerificationRow({
  row,
  onSelect,
}: {
  row: KycVerification;
  onSelect: (id: string) => void;
}) {
  const name = useMemo(
    () => [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email,
    [row.user.email, row.user.firstName, row.user.lastName],
  );

  return (
    <tr
      className="cursor-pointer border-t border-line hover:bg-surface-muted"
      onClick={() => onSelect(row.id)}
    >
      <td className="px-4 py-3">
        <div className="font-black">{name}</div>
        <div className="text-muted">{row.user.email}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3">
        {row.documentType ?? '--'} {row.documentNumberMasked ? `· ${row.documentNumberMasked}` : ''}
      </td>
      <td className="px-4 py-3">{row.faceMatchScore ?? '--'}</td>
      <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
      <td className="px-4 py-3">
        <button
          className="min-h-9 rounded-lg border border-line px-3 font-bold hover:bg-white"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row.id);
          }}
          type="button"
        >
          View
        </button>
      </td>
    </tr>
  );
}

function DetailDialog({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: row } = useGetKycVerificationQuery(id ?? '', { skip: !id });
  const [refresh, { isLoading: refreshing }] = useRefreshKycVerificationMutation();
  const [error, setError] = useState<string | null>(null);

  async function refreshRow() {
    if (!id) return;
    setError(null);
    try {
      await refresh(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to refresh this verification.'));
    }
  }

  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title="Verification detail"
        description="Only the masked/summary fields Didit returned -- the full decision payload is encrypted at rest and never shown here."
      >
        {row && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
              <div className="font-black">
                {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
                  row.user.email}
              </div>
              <div className="text-muted">{row.user.email}</div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="Status" value={<StatusBadge status={row.status} />} />
              <DetailField label="Provider" value={row.provider} />
              <DetailField label="Document type" value={row.documentType ?? '--'} />
              <DetailField label="Document number" value={row.documentNumberMasked ?? '--'} />
              <DetailField label="Face match score" value={row.faceMatchScore ?? '--'} />
              <DetailField label="Liveness score" value={row.livenessScore ?? '--'} />
              <DetailField label="Submitted" value={formatDateTime(row.createdAt)} />
              <DetailField
                label="Webhook received"
                value={row.webhookReceivedAt ? formatDateTime(row.webhookReceivedAt) : 'Not yet'}
              />
            </dl>
            {row.declineReason && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">
                Decline reason: {row.declineReason}
              </p>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">
                {error}
              </p>
            )}
            {(row.status === 'IN_PROGRESS' || row.status === 'IN_REVIEW') && (
              <ActionButton
                className="min-h-11 justify-self-start rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:opacity-60"
                onClick={() => void refreshRow()}
                pending={refreshing}
                pendingLabel="Refreshing"
                type="button"
              >
                Refresh from Didit
              </ActionButton>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-muted">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: KycStatus }) {
  const styles: Record<KycStatus, string> = {
    NOT_STARTED: 'bg-slate-100 text-slate-700',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
    IN_REVIEW: 'bg-amber-50 text-amber-700',
    APPROVED: 'bg-emerald-50 text-emerald-700',
    DECLINED: 'bg-red-50 text-red-700',
    ABANDONED: 'bg-slate-100 text-slate-700',
    EXPIRED: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${styles[status]}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
