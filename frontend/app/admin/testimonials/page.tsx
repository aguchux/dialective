'use client';

import { useState } from 'react';
import { CheckCircle2, Play, XCircle } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  Testimony,
  TestimonyStatus,
  normalizeErrorMessage,
  useGetAdminTestimonialsQuery,
  useReviewTestimonyMutation,
} from '@/store/api';

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

const STATUS_TABS: { key: TestimonyStatus | ''; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: '', label: 'All' },
];

function trainerLabel(user: { firstName: string | null; lastName: string | null; email: string }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}

function StatusBadge({ status }: { status: TestimonyStatus }) {
  if (status === 'PENDING') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
        Pending
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${
        status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {status === 'APPROVED' ? (
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
      ) : (
        <XCircle className="size-3.5" aria-hidden="true" />
      )}
      {status === 'APPROVED' ? 'Approved' : 'Rejected'}
    </span>
  );
}

function ReviewActions({ testimony }: { testimony: Testimony & { videoUrl: string | null } }) {
  const [review, { isLoading }] = useReviewTestimonyMutation();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (testimony.status !== 'PENDING') {
    return testimony.status === 'REJECTED' && testimony.rejectionReason ? (
      <p className="max-w-xs truncate text-xs text-muted" title={testimony.rejectionReason}>
        {testimony.rejectionReason}
      </p>
    ) : null;
  }

  async function approve() {
    setError(null);
    try {
      await review({ id: testimony.id, status: 'APPROVED' }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to approve this testimony.'));
    }
  }

  async function reject() {
    setError(null);
    try {
      await review({
        id: testimony.id,
        status: 'REJECTED',
        rejectionReason: reason.trim() || undefined,
      }).unwrap();
      setRejecting(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reject this testimony.'));
    }
  }

  if (rejecting) {
    return (
      <div className="grid gap-2">
        <input
          className="min-h-9 w-full min-w-48 rounded-lg border border-line bg-white px-3 text-sm"
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          value={reason}
        />
        <div className="flex gap-2">
          <ActionButton
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-danger px-3 py-1.5 text-sm font-extrabold text-white hover:opacity-90"
            onClick={() => void reject()}
            pending={isLoading}
            pendingLabel="Rejecting"
            type="button"
          >
            Confirm reject
          </ActionButton>
          <button
            className={secondaryButtonClass}
            onClick={() => setRejecting(false)}
            type="button"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-xs font-bold text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <ActionButton
          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-sm font-extrabold text-white hover:bg-accent-dark"
          onClick={() => void approve()}
          pending={isLoading}
          pendingLabel="Approving"
          type="button"
        >
          Approve
        </ActionButton>
        <button className={secondaryButtonClass} onClick={() => setRejecting(true)} type="button">
          Reject
        </button>
      </div>
      {error && (
        <p className="text-xs font-bold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function AdminTestimonialsPage() {
  const [status, setStatus] = useState<TestimonyStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, refetch } = useGetAdminTestimonialsQuery({
    page,
    pageSize,
    status: status || undefined,
  });

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Testimonials</h1>
          <p className="leading-relaxed text-muted">
            Review trainer-submitted video and text testimonies. Approving credits the configured DL
            reward and makes the testimony eligible for the homepage carousel.
          </p>
        </div>

        <div className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                status === tab.key
                  ? 'bg-accent text-white'
                  : 'bg-white text-ink hover:bg-surface-muted'
              }`}
              key={tab.label}
              onClick={() => {
                setStatus(tab.key);
                setPage(1);
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="grid gap-4 overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          {isLoading ? (
            <p className="p-5 text-muted">Loading...</p>
          ) : isError ? (
            <div className="grid gap-3 p-5 text-center">
              <p className="font-extrabold">Could not load testimonials.</p>
              <button className={secondaryButtonClass} onClick={() => void refetch()} type="button">
                Try again
              </button>
            </div>
          ) : data && data.items.length > 0 ? (
            <div className="divide-y divide-line">
              {data.items.map((item) => (
                <article
                  className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-start"
                  key={item.id}
                >
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-extrabold">{trainerLabel(item.user)}</p>
                      <StatusBadge status={item.status} />
                      {item.rewardCredited && (
                        <span className="text-xs font-bold text-emerald-700">Reward credited</span>
                      )}
                    </div>
                    {item.kind === 'TEXT' ? (
                      <p className="max-w-xl leading-relaxed text-ink">&ldquo;{item.text}&rdquo;</p>
                    ) : item.videoUrl ? (
                      <video
                        className="aspect-video w-full max-w-xs rounded-lg bg-black"
                        controls
                        src={item.videoUrl}
                      />
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <Play className="size-4" aria-hidden="true" /> Video unavailable
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      Submitted {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <ReviewActions testimony={item} />
                </article>
              ))}
            </div>
          ) : (
            <p className="p-5 text-muted">No testimonials match this filter.</p>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
              <p className="text-sm text-muted">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  className={secondaryButtonClass}
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
