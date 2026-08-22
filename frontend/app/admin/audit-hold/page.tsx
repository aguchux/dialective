'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { RecordingAuditDialog } from '@/components/admin/RecordingAuditDialog';
import { ReleaseAuditHoldDialog } from '@/components/admin/ReleaseAuditHoldDialog';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { PublicUser, useGetAuditHoldQueueQuery } from '@/store/api';

function trainerName(user: PublicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function formatSince(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

/**
 * Admin audit queue: every trainer currently on an automatic audit hold
 * (WordsService.createRecording, every PlatformSettings.
 * auditHoldEveryNSubmissions submissions -- default 500), so an admin can
 * review their recordings and release the hold from one place instead of
 * navigating to /admin/users and searching one trainer at a time.
 *
 * Deliberately reuses the existing per-trainer review/audit machinery
 * unchanged: RecordingAuditDialog already carousels through a trainer's
 * entire WordRecording+Submission history with instant VALID/INVALID
 * marking (AdminRecordingsService.audit -- no OTP unless clawing back an
 * existing payout), and ReleaseAuditHoldDialog already handles the
 * OTP-gated release. This page only adds the "who's currently waiting"
 * list and wires those two dialogs to each row.
 */
export default function AdminAuditHoldQueuePage() {
  const { data: users, isLoading } = useGetAuditHoldQueueQuery();
  const [reviewing, setReviewing] = useState<PublicUser | null>(null);
  const [releasing, setReleasing] = useState<PublicUser | null>(null);

  const columns: DataTableColumn<PublicUser>[] = [
    {
      key: 'trainer',
      header: 'Trainer',
      sortValue: (u) => trainerName(u),
      render: (u) => (
        <div className="min-w-0">
          <Link className="font-extrabold text-accent no-underline hover:text-accent-dark" href={`/admin/users/${u.id}`}>
            {trainerName(u)}
          </Link>
          <p className="break-all text-sm text-muted">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'dialect',
      header: 'Dialect',
      sortValue: (u) => u.dialectTag ?? '',
      render: (u) => <span className="text-sm text-muted">{u.dialectTag ?? '—'}</span>,
    },
    {
      key: 'tasks',
      header: 'Total tasks',
      sortValue: (u) => (u.submissionsCount ?? 0) + (u.wordRecordingsCount ?? 0),
      render: (u) => (
        <span className="font-mono font-bold tabular-nums">
          {((u.submissionsCount ?? 0) + (u.wordRecordingsCount ?? 0)).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'auditHoldAt',
      header: 'On hold since',
      sortValue: (u) => u.auditHoldAt ?? '',
      render: (u) => <span className="text-sm text-muted">{formatSince(u.auditHoldAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark"
            onClick={() => setReviewing(u)}
            type="button"
          >
            Review recordings
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted"
            onClick={() => setReleasing(u)}
            type="button"
          >
            Release hold
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Audit queue</h1>
          <p className="leading-relaxed text-muted">
            Trainers automatically paused for a routine review after reaching a submission-count threshold. Review
            their recordings (play the audio, accept or reject each one instantly), then release the hold so they
            can resume training.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={users ?? []}
          rowKey={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No one is currently on an audit hold."
          searchable
          searchPlaceholder="Search name or email"
        />
      </div>

      {reviewing && (
        <RecordingAuditDialog
          onOpenChange={(open) => !open && setReviewing(null)}
          open
          trainerId={reviewing.id}
          trainerName={trainerName(reviewing)}
        />
      )}
      {releasing && <ReleaseAuditHoldDialog onClose={() => setReleasing(null)} user={releasing} />}
    </AdminShell>
  );
}
