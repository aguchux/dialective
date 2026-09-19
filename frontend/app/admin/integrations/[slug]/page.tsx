'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { formatDateTime } from '@/components/dashboard/shared';
import {
  AdminIntegrationSubscription,
  normalizeErrorMessage,
  useGetAdminIntegrationSubscriptionsQuery,
  useListAdminIntegrationsQuery,
  useReviewIntegrationSubscriptionMutation,
  useSetIntegrationSubscriptionCertifiedMutation,
} from '@/store/api';

/**
 * One integration's access requests.
 *
 * The integrations list holds the settings for each product; the people
 * asking to fulfil it live here, one level down, so neither table has to
 * be both a settings form and a queue. Reached by clicking an
 * integration's name.
 *
 * Subscribing is a request, not a grant -- nobody can claim or fulfil
 * anything for this integration until their row here is approved (see
 * IntegrationsService.isSubscribed).
 */
export default function AdminIntegrationSubscriptionsPage() {
  // Next 14 passes params as a plain object; useParams is this repo's
  // convention and avoids the `use(params)` form, which is Next 15+.
  const { slug } = useParams<{ slug: string }>();
  const { data: integrations = [] } = useListAdminIntegrationsQuery();
  const integration = integrations.find((row) => row.slug === slug);

  const { data: requests = [], isLoading } = useGetAdminIntegrationSubscriptionsQuery({ slug });
  const [review, { isLoading: reviewing }] = useReviewIntegrationSubscriptionMutation();
  const [setCertified] = useSetIntegrationSubscriptionCertifiedMutation();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<AdminIntegrationSubscription | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [error, setError] = useState('');

  const pendingCount = requests.filter((row) => row.status === 'PENDING').length;
  // Only ID Review has certified reviewers (see the certified column below).
  const supportsCertification = slug === 'p2p-kyc-review';

  /**
   * Certification is a much larger grant than approval -- an unobscured
   * document view and a verdict that settles a verification on its own --
   * so granting it confirms explicitly. Revoking does not: making it
   * harder to take a privilege away than to give it is the wrong way
   * round.
   */
  async function toggleCertified(row: AdminIntegrationSubscription, certified: boolean) {
    if (
      certified &&
      !window.confirm(
        `Certify ${row.user.email}?

They will see ID documents unobscured, and their single decision will approve or decline a member's KYC with no second reviewer and no admin confirmation.`,
      )
    ) {
      return;
    }
    setError('');
    try {
      await setCertified({ id: row.id, certified }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not change certification'));
    }
  }

  async function decide(
    row: AdminIntegrationSubscription,
    decision: 'approve' | 'reject',
    reviewNote?: string,
  ) {
    setError('');
    setReviewingId(row.id);
    try {
      await review({ id: row.id, decision, reviewNote }).unwrap();
      setDeclining(null);
      setDeclineNote('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save that decision'));
    } finally {
      setReviewingId(null);
    }
  }

  const columns: DataTableColumn<AdminIntegrationSubscription>[] = [
    {
      key: 'user',
      header: 'Member',
      sortValue: (row) => row.user.email,
      render: (row) => (
        <div>
          <p className="font-bold">
            {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email}
          </p>
          <p className="text-xs text-muted">{row.user.email}</p>
        </div>
      ),
    },
    {
      // The member's phone and whether they proved it -- an unverified
      // number is a number they typed, not one they hold.
      key: 'phone',
      header: 'Mobile',
      sortValue: (row) => row.user.phoneNumber ?? '',
      render: (row) =>
        row.user.phoneNumber ? (
          <div>
            <p className="text-sm tabular-nums">{row.user.phoneNumber}</p>
            <span
              className={`text-xs font-extrabold ${
                row.user.phoneVerified ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {row.user.phoneVerified ? 'verified' : 'unverified'}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted">No number</span>
        ),
    },
    {
      key: 'kyc',
      header: 'KYC',
      sortValue: (row) => row.user.kycStatus,
      render: (row) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black ${
            row.user.kycStatus === 'APPROVED'
              ? 'bg-emerald-100 text-emerald-800'
              : row.user.kycStatus === 'DECLINED'
                ? 'bg-red-100 text-red-800'
                : row.user.kycStatus === 'IN_REVIEW' || row.user.kycStatus === 'IN_PROGRESS'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-surface-muted text-muted'
          }`}
        >
          {row.user.kycStatus.toLowerCase().replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'tasks',
      header: 'Tasks',
      searchable: false,
      sortValue: (row) => row.user.taskCount,
      render: (row) => (
        <span className="text-sm font-extrabold tabular-nums">
          {row.user.taskCount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      searchable: false,
      sortValue: (row) => row.subscribedAt,
      render: (row) => <span className="text-sm">{formatDateTime(row.subscribedAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => row.status,
      render: (row) => (
        <div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${
              row.status === 'APPROVED'
                ? 'bg-emerald-100 text-emerald-800'
                : row.status === 'REJECTED'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'
            }`}
          >
            {row.status.toLowerCase()}
          </span>
          {row.reviewNote && <p className="mt-1 text-xs text-muted">{row.reviewNote}</p>}
        </div>
      ),
    },
    // Certification is an ID Review concept -- a certified reviewer sees
    // documents unobscured and decides a verification outright. It means
    // nothing for any other integration, so the column is omitted rather
    // than shown as a control that does nothing.
    ...(supportsCertification
      ? [
          {
            key: 'certified',
            header: 'Certified',
            searchable: false,
            sortValue: (row: AdminIntegrationSubscription) => (row.certified ? 1 : 0),
            render: (row: AdminIntegrationSubscription) =>
              row.status !== 'APPROVED' ? (
                <span className="text-xs text-muted">—</span>
              ) : (
                <label className="inline-flex items-center gap-2 text-sm font-bold">
                  <input
                    checked={row.certified}
                    onChange={(e) => void toggleCertified(row, e.target.checked)}
                    type="checkbox"
                  />
                  {row.certified ? 'Certified' : 'Peer'}
                </label>
              ),
          },
        ]
      : []),
    {
      key: 'actions',
      header: '',
      searchable: false,
      render: (row) =>
        row.status === 'PENDING' ? (
          <div className="flex gap-2">
            <ActionButton
              className="min-h-9 rounded-lg bg-accent px-3 text-sm font-extrabold text-white disabled:opacity-50"
              onClick={() => void decide(row, 'approve')}
              pending={reviewing && reviewingId === row.id}
              pendingLabel="Saving"
              type="button"
            >
              Approve
            </ActionButton>
            <button
              className="min-h-9 rounded-lg border border-red-200 px-3 text-sm font-extrabold text-red-700 hover:bg-red-50"
              onClick={() => {
                setDeclineNote('');
                setDeclining(row);
              }}
              type="button"
            >
              Decline
            </button>
          </div>
        ) : row.status === 'APPROVED' ? (
          <button
            className="min-h-9 rounded-lg border border-line px-3 text-sm font-extrabold hover:bg-surface-muted"
            onClick={() => {
              setDeclineNote('');
              setDeclining(row);
            }}
            type="button"
          >
            Revoke
          </button>
        ) : (
          <ActionButton
            className="min-h-9 rounded-lg border border-line px-3 text-sm font-extrabold disabled:opacity-50"
            onClick={() => void decide(row, 'approve')}
            pending={reviewing && reviewingId === row.id}
            pendingLabel="Saving"
            type="button"
          >
            Approve
          </ActionButton>
        ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-5">
        <div>
          <Link
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-extrabold text-muted hover:text-ink"
            href="/admin/integrations"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to integrations
          </Link>
          <h1 className="mt-2 text-2xl font-black">{integration?.name ?? slug}</h1>
          <p className="mt-1 text-sm text-muted">
            {pendingCount > 0
              ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting on you. `
              : 'Nothing waiting on you. '}
            A member who subscribes cannot fulfil anything for this integration until you approve
            them.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}

        <DataTable
          columns={columns}
          emptyMessage="Nobody has requested access to this integration yet."
          isLoading={isLoading}
          pageSize={5}
          adjustablePageSize
          rowKey={(row) => row.id}
          rows={requests}
          searchPlaceholder="Search members..."
        />
      </div>

      {declining && (
        <Dialog open onOpenChange={(open) => !open && setDeclining(null)}>
          <DialogContent
            title={declining.status === 'APPROVED' ? 'Revoke access' : 'Decline request'}
            description={
              declining.status === 'APPROVED'
                ? `${declining.user.email} will immediately lose access to ${declining.integration.name}.`
                : `${declining.user.email} will not be able to fulfil ${declining.integration.name} requests. They can ask again.`
            }
          >
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-bold">
                Reason (shown to the member, optional)
                <textarea
                  autoFocus
                  className="min-h-20 rounded-lg border border-line bg-bg p-2 text-sm"
                  maxLength={500}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  value={declineNote}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
                  onClick={() => setDeclining(null)}
                  type="button"
                >
                  Cancel
                </button>
                <ActionButton
                  className="min-h-10 rounded-lg bg-red-700 px-4 text-sm font-extrabold text-white disabled:opacity-60"
                  onClick={() => void decide(declining, 'reject', declineNote.trim() || undefined)}
                  pending={reviewing && reviewingId === declining.id}
                  pendingLabel="Saving"
                  type="button"
                >
                  {declining.status === 'APPROVED' ? 'Revoke access' : 'Decline request'}
                </ActionButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AdminShell>
  );
}
