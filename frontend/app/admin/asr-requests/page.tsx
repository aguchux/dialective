'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import {
  AsrTranscriptionRequestAdminRow,
  useGetAdminAsrTranscriptionRequestsQuery,
  useSetAsrTranscriptionRequestStatusMutation,
  useSetDialectAsrGateBypassMutation,
} from '@/store/api';

function trainerName(row: AsrTranscriptionRequestAdminRow): string {
  return [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email;
}

const STATUS_LABEL: Record<AsrTranscriptionRequestAdminRow['status'], string> = {
  PENDING: 'Pending',
  ACKNOWLEDGED: 'Acknowledged',
  FULFILLED: 'Fulfilled',
};

const STATUS_CLASS: Record<AsrTranscriptionRequestAdminRow['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  FULFILLED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

/**
 * Admin queue of trainer requests for ASR transcription support on a
 * dialect with no models/asr-registry.yaml entry (see
 * WordsService.assertAsrAvailable / AsrRegistryService.resolve). Marking a
 * request Acknowledged/Fulfilled here is TRACKING ONLY -- it does not touch
 * the registry and does not unlock the dialect. A dialect only becomes
 * usable once it has a real registry entry + checkpoint (same manual
 * process used for Kinyarwanda) -- this page just tells admins which
 * dialects have real trainer demand waiting.
 */
export default function AdminAsrTranscriptionRequestsPage() {
  const { data: requests, isLoading } = useGetAdminAsrTranscriptionRequestsQuery();
  const [setStatus, { isLoading: isUpdating }] = useSetAsrTranscriptionRequestStatusMutation();
  const [setGateBypass, { isLoading: isTogglingBypass }] = useSetDialectAsrGateBypassMutation();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [togglingDialectId, setTogglingDialectId] = useState<string | null>(null);

  async function handleSetStatus(
    row: AsrTranscriptionRequestAdminRow,
    status: AsrTranscriptionRequestAdminRow['status'],
  ) {
    setUpdatingId(row.id);
    try {
      await setStatus({ id: row.id, status }).unwrap();
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleGateBypass(row: AsrTranscriptionRequestAdminRow) {
    setTogglingDialectId(row.dialect.id);
    try {
      await setGateBypass({
        dialectId: row.dialect.id,
        bypassed: !row.dialect.asrGateBypassed,
      }).unwrap();
    } finally {
      setTogglingDialectId(null);
    }
  }

  const columns: DataTableColumn<AsrTranscriptionRequestAdminRow>[] = [
    {
      key: 'trainer',
      header: 'Trainer',
      sortValue: (r) => `${trainerName(r)} ${r.user.email}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-extrabold text-ink">{trainerName(r)}</p>
          <p className="break-all text-sm text-muted">{r.user.email}</p>
        </div>
      ),
    },
    {
      key: 'dialect',
      header: 'Dialect',
      sortValue: (r) => r.dialect.name,
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-ink">
            {r.dialect.name} <span className="text-muted">({r.dialect.tag})</span>
          </span>
          {r.dialect.asrGateBypassed && (
            <span className="inline-flex w-fit items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
              Gate bypassed
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${STATUS_CLASS[r.status]}`}
        >
          {STATUS_LABEL[r.status]}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Requested',
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <span className="text-sm text-muted">{new Date(r.createdAt).toLocaleString()}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-2">
          {r.status === 'PENDING' && (
            <button
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
              disabled={isUpdating && updatingId === r.id}
              onClick={() => void handleSetStatus(r, 'ACKNOWLEDGED')}
              type="button"
            >
              Acknowledge
            </button>
          )}
          {r.status !== 'FULFILLED' && (
            <button
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
              disabled={isUpdating && updatingId === r.id}
              onClick={() => void handleSetStatus(r, 'FULFILLED')}
              type="button"
            >
              Mark fulfilled
            </button>
          )}
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
            disabled={isTogglingBypass && togglingDialectId === r.dialect.id}
            onClick={() => void handleToggleGateBypass(r)}
            type="button"
          >
            {r.dialect.asrGateBypassed ? 'Re-enable gate' : 'Bypass gate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Transcription requests</h1>
          <p className="leading-relaxed text-muted">
            Trainers whose dialect has no ASR transcription support yet (no
            models/asr-registry.yaml entry) are shown a "Send request" prompt instead of being
            stuck. Acknowledging or marking a request fulfilled here is for tracking only -- it
            does not enable transcription. If no checkpoint is coming soon, use "Bypass gate" to
            let that dialect record again as before, unscored/untranscribed, without waiting on a
            real registry entry.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={requests ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No transcription requests yet."
          searchable
          searchPlaceholder="Search name, email, or dialect"
        />
      </div>
    </AdminShell>
  );
}
