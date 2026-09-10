'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import {
  AsrTranscriptionRequestAdminRow,
  useGetAdminAsrTranscriptionRequestsQuery,
  useGetAsrGateBypassStatusQuery,
  useSetAsrGateBypassMutation,
  useSetAsrTranscriptionRequestStatusMutation,
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
 * the registry and does not unlock any dialect. A dialect only becomes
 * usable once it has a real registry entry + checkpoint (same manual
 * process used for Kinyarwanda) -- this page just tells admins which
 * dialects have real trainer demand waiting.
 *
 * The gate bypass below is a single GLOBAL switch (PlatformSettings.
 * asrGateGloballyBypassed), not a per-dialect one -- while on, no dialect
 * is blocked for missing ASR, regardless of the registry. Use it when
 * checkpoints aren't ready for one or more dialects and aren't coming soon,
 * to unblock every affected trainer at once.
 */
export default function AdminAsrTranscriptionRequestsPage() {
  const { data: requests, isLoading } = useGetAdminAsrTranscriptionRequestsQuery();
  const { data: gateBypassStatus, isLoading: isLoadingBypassStatus } =
    useGetAsrGateBypassStatusQuery();
  const [setStatus, { isLoading: isUpdating }] = useSetAsrTranscriptionRequestStatusMutation();
  const [setGateBypass, { isLoading: isTogglingBypass }] = useSetAsrGateBypassMutation();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  async function handleToggleGateBypass() {
    await setGateBypass({ bypassed: !gateBypassStatus?.bypassed }).unwrap();
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
        <span className="text-sm font-bold text-ink">
          {r.dialect.name} <span className="text-muted">({r.dialect.tag})</span>
        </span>
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
        </div>
      ),
    },
  ];

  const bypassed = gateBypassStatus?.bypassed ?? false;

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Transcription requests</h1>
          <p className="leading-relaxed text-muted">
            Trainers whose dialect has no ASR transcription support yet (no
            models/asr-registry.yaml entry) are shown a "Send request" prompt instead of being
            stuck. Acknowledging or marking a request fulfilled below is for tracking only -- it
            does not enable transcription.
          </p>
        </div>

        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
            bypassed
              ? 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950'
              : 'border-line bg-surface'
          }`}
        >
          <div className="min-w-0">
            <p className="font-extrabold text-ink">
              ASR gate: {bypassed ? 'Bypassed for every dialect' : 'Active'}
            </p>
            <p className="text-sm text-muted">
              A single global switch. When bypassed, every dialect with no ASR checkpoint can
              record again (unscored/untranscribed) instead of staying blocked -- use this while
              checkpoints are still being sourced or trained.
            </p>
          </div>
          <button
            className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-extrabold transition-colors disabled:opacity-50 ${
              bypassed
                ? 'border border-line bg-surface text-ink hover:bg-surface-muted'
                : 'bg-accent text-white hover:bg-accent-dark'
            }`}
            disabled={isLoadingBypassStatus || isTogglingBypass}
            onClick={() => void handleToggleGateBypass()}
            type="button"
          >
            {bypassed ? 'Re-enable gate for all dialects' : 'Bypass gate for all dialects'}
          </button>
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
