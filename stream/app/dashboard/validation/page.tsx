'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import {
  useApproveValidationMutation,
  useGetOrgContributionQuery,
  useListMyValidationsQuery,
  useListValidationQueueQuery,
  useRejectValidationMutation,
} from '@/store/api';
import type { SubscriberOrgRole } from '@/lib/api-client';
import type { ValidationReviewStatus } from '@/store/api';
import {
  Card,
  ErrorText,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/components/ui';

const CAN_REVIEW: SubscriberOrgRole[] = ['OWNER', 'ADMIN', 'DATASET_MANAGER'];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-black text-ink">{value}</p>
    </Card>
  );
}

function StatusBadge({ status }: { status: ValidationReviewStatus }) {
  const shapes: Record<
    ValidationReviewStatus,
    { icon: typeof Clock; label: string; className: string }
  > = {
    PENDING: { icon: Clock, label: 'Pending review', className: 'bg-amber-50 text-amber-700' },
    APPROVED: {
      icon: CheckCircle2,
      label: 'Approved',
      className: 'bg-emerald-50 text-emerald-700',
    },
    REJECTED: { icon: XCircle, label: 'Rejected', className: 'bg-rose-50 text-rose-700' },
  };
  const { icon: Icon, label, className } = shapes[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${className}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}

function ReviewQueue() {
  const { data: queue, isLoading } = useListValidationQueueQuery();
  const [approveValidation] = useApproveValidationMutation();
  const [rejectValidation] = useRejectValidationMutation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submitReject(validationId: string) {
    setError(null);
    try {
      await rejectValidation({ validationId, reason }).unwrap();
      setRejectingId(null);
      setReason('');
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to reject this validation.');
    }
  }

  if (isLoading) {
    return null;
  }
  if (!queue || queue.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
        Awaiting your review ({queue.length})
      </h2>
      <Card>
        <div className="divide-y divide-line">
          {queue.map((v) => (
            <div className="p-4" key={v.id}>
              <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <p className="font-mono text-sm text-ink">{v.recordingId}</p>
                  <p className="text-xs text-muted">
                    Submitted by {v.user ? `${v.user.firstName} ${v.user.lastName}` : 'a teammate'}{' '}
                    · {new Date(v.createdAt).toLocaleDateString()}
                  </p>
                  {v.notes && <p className="mt-1 text-xs text-muted">&ldquo;{v.notes}&rdquo;</p>}
                  <p className="mt-1 text-sm font-bold text-ink">Overall: {v.overallScore}</p>
                </div>
                <div className="flex items-start gap-2">
                  <PrimaryButton onClick={() => void approveValidation(v.id)} type="button">
                    Approve
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => setRejectingId(rejectingId === v.id ? null : v.id)}
                    type="button"
                  >
                    Reject
                  </SecondaryButton>
                </div>
              </div>
              {rejectingId === v.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <div className="flex-1">
                    <TextInput
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejecting (shown to the submitter)"
                      value={reason}
                    />
                  </div>
                  <PrimaryButton
                    disabled={reason.trim().length < 3}
                    onClick={() => void submitReject(v.id)}
                    type="button"
                  >
                    Confirm reject
                  </PrimaryButton>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      {error && <div className="mt-2">{<ErrorText>{error}</ErrorText>}</div>}
    </div>
  );
}

export default function ValidationPage() {
  const { data: session } = useSession();
  const canReview = session?.user.orgRole ? CAN_REVIEW.includes(session.user.orgRole) : false;

  const { data: contribution } = useGetOrgContributionQuery();
  const { data: validations, isLoading } = useListMyValidationsQuery();

  return (
    <div>
      <PageHeading
        subtitle="Your organization's contribution to the Independent Subscriber Validation Programme (ISVP). Every submission is peer-reviewed by an org admin before it counts toward the public ISVC."
        title="Validation"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Recordings Validated"
          value={String(contribution?.recordingsValidated ?? 0)}
        />
        <StatCard label="Total Validations" value={String(contribution?.totalValidations ?? 0)} />
      </div>

      {canReview && <ReviewQueue />}

      <Card>
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading...</p>
        ) : validations && validations.length > 0 ? (
          <div className="divide-y divide-line">
            {validations.map((v) => (
              <div className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center" key={v.id}>
                <div>
                  <p className="font-mono text-sm text-ink">{v.recordingId}</p>
                  <p className="text-xs text-muted">
                    {v.user ? `${v.user.firstName} ${v.user.lastName}` : 'You'} ·{' '}
                    {new Date(v.createdAt).toLocaleDateString()}
                  </p>
                  {v.notes && <p className="mt-1 text-xs text-muted">&ldquo;{v.notes}&rdquo;</p>}
                  {v.status === 'REJECTED' && v.rejectionReason && (
                    <p className="mt-1 text-xs font-semibold text-rose-700">
                      Rejected: {v.rejectionReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <StatusBadge status={v.status} />
                  <p className="text-sm font-bold text-ink">Overall: {v.overallScore}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">
            No validations submitted yet. Validate recordings from Explore Voice Data.
          </p>
        )}
      </Card>
    </div>
  );
}
