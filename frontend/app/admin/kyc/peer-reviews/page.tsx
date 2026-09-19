'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { formatDateTime } from '@/components/dashboard/shared';
import {
  AdminPeerReviewItem,
  normalizeErrorMessage,
  useGetAdminPeerReviewQueueQuery,
  useResetPeerReviewsMutation,
} from '@/store/api';

/**
 * Verifications still in community review -- a monitoring view, not a
 * queue of work.
 *
 * Peer consensus now moves a trainer's KycStatus on its own, so a document
 * that reaches the required number of agreeing verdicts is decided and
 * leaves this list without anyone acting. What remains is either still
 * mid-review, or flagged "needs an admin" because applying the consensus
 * failed -- that second case is the only one that genuinely needs a human.
 *
 * The admin's standing power is correction, not approval: sending a
 * document back for a fresh run when the review itself looked wrong, and
 * the approve/decline and reversal controls on the verification page.
 */
export default function AdminPeerReviewsPage() {
  const { data: rows = [], isLoading } = useGetAdminPeerReviewQueueQuery();
  const [reset, { isLoading: resetting }] = useResetPeerReviewsMutation();
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function sendBack(row: AdminPeerReviewItem) {
    if (
      !window.confirm(
        `Clear all ${row.reviews.length} review(s) and put this document back in the pool for a fresh set of reviewers?`,
      )
    ) {
      return;
    }
    setError('');
    setResettingId(row.id);
    try {
      await reset(row.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not reset those reviews'));
    } finally {
      setResettingId(null);
    }
  }

  const columns: DataTableColumn<AdminPeerReviewItem>[] = [
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
      key: 'verdicts',
      header: 'Peer verdicts',
      searchable: false,
      render: (row) => (
        <div className="grid gap-1">
          {row.reviews.map((review) => (
            <div className="text-xs" key={review.id}>
              <span
                className={`font-black ${
                  review.verdict === 'APPROVE' ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {review.verdict === 'APPROVE' ? 'Approved' : 'Declined'}
              </span>{' '}
              by {review.reviewer.firstName ?? review.reviewer.email}
              {/* A mismatch is a signal, not a disqualification -- OCR is
                  imperfect, so the admin judges it rather than the system.
                  null is NOT a mismatch: it means the document carries no
                  number, so there was nothing to compare. Showing that as
                  "did not match" would turn an absence into an accusation. */}
              {review.documentNumberMatched === false && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                  number did not match
                </span>
              )}
              {review.documentNumberMatched === null && (
                <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 font-bold text-muted">
                  no number on document
                </span>
              )}
              {review.declineReason && (
                <p className="text-muted">&ldquo;{review.declineReason}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'recommendation',
      header: 'Status',
      sortValue: (row) => (row.readyForAdmin ? '0' : '1'),
      render: (row) =>
        // Consensus reached but the document is STILL here: auto-apply did
        // not take, so this one is stuck and needs a human. Flagged red
        // regardless of which way the peers leaned -- the verdict is not
        // the problem, the fact that it never landed is.
        row.readyForAdmin ? (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-800">
            needs an admin — {row.recommendation === 'APPROVE' ? 'approve' : 'decline'} (
            {row.approvals}-{row.declines}) did not apply
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
            in review ({row.approvals}-{row.declines} of {row.consensusCount})
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      searchable: false,
      render: (row) => (
        <div className="flex gap-2">
          <Link
            className="min-h-9 rounded-lg bg-accent px-3 py-2 text-sm font-extrabold text-white"
            href={`/admin/kyc/${row.id}`}
          >
            Open
          </Link>
          <ActionButton
            className="min-h-9 rounded-lg border border-line px-3 text-sm font-extrabold disabled:opacity-50"
            onClick={() => void sendBack(row)}
            pending={resetting && resettingId === row.id}
            pendingLabel="Resetting"
            type="button"
          >
            Send back
          </ActionButton>
        </div>
      ),
    },
  ];

  const stuck = rows.filter((row) => row.readyForAdmin).length;

  return (
    <AdminShell>
      <div className="grid gap-5">
        <div>
          <h1 className="text-2xl font-black">Peer-reviewed IDs</h1>
          <p className="mt-1 text-sm text-muted">
            {stuck > 0
              ? `${stuck} document${stuck === 1 ? '' : 's'} reached consensus but could not be applied — those need you. `
              : 'Nothing needs you right now. '}
            Community reviewers check the name on a document against the account, and once enough
            of them agree the verdict is applied automatically. Documents below are still in
            review. &ldquo;Send back&rdquo; clears their verdicts and returns one to the pool for a
            fresh run.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}

        <DataTable
          columns={columns}
          emptyMessage="No documents have been peer-reviewed yet."
          isLoading={isLoading}
          pageSize={5}
          adjustablePageSize
          rowKey={(row) => row.id}
          rows={rows}
          searchPlaceholder="Search members..."
        />
      </div>
    </AdminShell>
  );
}
