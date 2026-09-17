'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { RecordingAuditDialog } from '@/components/admin/RecordingAuditDialog';
import { ReleaseAuditHoldDialog } from '@/components/admin/ReleaseAuditHoldDialog';
import { RevokePhoneVerificationDialog } from '@/components/admin/RevokePhoneVerificationDialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { TrainerStarRating } from '@/components/ui/TrainerStarRating';
import { activityLabels } from '@/components/trainer/TrainerDashboard';
import { useDialectName } from '@/lib/dialect-name';
import {
  trainerRatingBadgeClass,
  trainerRatingLabel,
  trainerRatingOptions,
  type TrainerRating,
} from '@/lib/trainer-rating';
import {
  normalizeErrorMessage,
  useAssignValidatorDialectMutation,
  useDeleteUserMutation,
  useGetAdminUserQuery,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetPlatformSettingsQuery,
  useGetUnsettledQuery,
  useGetUserActivityQuery,
  useGetValidatorDialectAssignmentsQuery,
  useLockUserMutation,
  useRequestUserDeleteOtpMutation,
  useRequestUserLockOtpMutation,
  useResetUserDialectMutation,
  useSendInstantTrainerReportMutation,
  useSettleOneMutation,
  useUnassignValidatorDialectMutation,
  useUpdateTrainerRatingMutation,
  useUpdateValidatorLevelMutation,
  type UnsettledRow,
  type UserActivityEntry,
} from '@/store/api';

const validatorLevelOptions = ['L1', 'L2', 'L3'] as const;

const inputClass =
  'min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-accent-dark',
  SUSPENDED: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOCKED: 'bg-[#fde8e8] text-[#a3242f]',
};

const kycStyles: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  IN_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-red-50 text-red-700',
  ABANDONED: 'bg-slate-100 text-slate-700',
  EXPIRED: 'bg-slate-100 text-slate-700',
};

function formatTokens(value: string | number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = params.id;
  const selfId = session?.user?.id;

  const { data: user, isLoading } = useGetAdminUserQuery(userId);
  const { data: validatorDialects } = useGetValidatorDialectAssignmentsQuery(userId, {
    skip: user?.role !== 'VALIDATOR',
  });
  const { data: dialectCountries } = useGetCountriesQuery(undefined, {
    skip: user?.role !== 'VALIDATOR',
  });
  const [activityBatch, setActivityBatch] = useState(1);
  const ACTIVITY_BATCH_SIZE = 100;
  const { data: activity, isLoading: isLoadingActivity } = useGetUserActivityQuery({
    userId,
    page: activityBatch,
    pageSize: ACTIVITY_BATCH_SIZE,
  });
  const [pendingScoringPage, setPendingScoringPage] = useState(1);
  const PENDING_SCORING_PAGE_SIZE = 20;
  const { data: pendingScoring, isLoading: isLoadingPendingScoring } = useGetUnsettledQuery({
    userId,
    page: pendingScoringPage,
    pageSize: PENDING_SCORING_PAGE_SIZE,
  });

  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [releaseHoldDialogOpen, setReleaseHoldDialogOpen] = useState(false);
  const [revokePhoneDialogOpen, setRevokePhoneDialogOpen] = useState(false);
  const [resetDialectDialogOpen, setResetDialectDialogOpen] = useState(false);

  const [sendReport, { isLoading: isSendingReport }] = useSendInstantTrainerReportMutation();
  const [updateTrainerRating, { isLoading: isUpdatingTrainerRating }] =
    useUpdateTrainerRatingMutation();
  const [updateValidatorLevel, { isLoading: isUpdatingValidatorLevel }] =
    useUpdateValidatorLevelMutation();
  const [assignValidatorDialect, { isLoading: isAssigningDialect }] =
    useAssignValidatorDialectMutation();
  const [unassignValidatorDialect] = useUnassignValidatorDialectMutation();
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [validatorLevelError, setValidatorLevelError] = useState<string | null>(null);
  const [validatorDialectError, setValidatorDialectError] = useState<string | null>(null);
  const [newDialectCountryId, setNewDialectCountryId] = useState('');
  const [newDialectId, setNewDialectId] = useState('');
  const { data: dialectsForNewCountry } = useGetDialectsQuery(newDialectCountryId, {
    skip: !newDialectCountryId,
  });

  async function handleSendReport() {
    if (!user) return;
    setReportMessage(null);
    setReportError(null);
    try {
      await sendReport(user.id).unwrap();
      setReportMessage(`Report sent to ${user.email}.`);
    } catch (err) {
      setReportError(normalizeErrorMessage(err, 'Unable to send this report.'));
    }
  }

  async function handleTrainerRating(rating: TrainerRating) {
    if (!user || user.role !== 'TRAINER' || rating === user.trainerRating) return;
    setRatingError(null);
    try {
      await updateTrainerRating({ id: user.id, rating }).unwrap();
    } catch (err) {
      setRatingError(normalizeErrorMessage(err, 'Unable to update this trainer rating.'));
    }
  }

  async function handleValidatorLevel(level: 'L1' | 'L2' | 'L3') {
    if (!user || (user.role === 'VALIDATOR' && level === user.validatorLevel)) return;
    setValidatorLevelError(null);
    try {
      await updateValidatorLevel({ id: user.id, validatorLevel: level }).unwrap();
    } catch (err) {
      setValidatorLevelError(normalizeErrorMessage(err, 'Unable to update this validator tier.'));
    }
  }

  async function handleAssignDialect() {
    if (!user || !newDialectId) return;
    setValidatorDialectError(null);
    try {
      await assignValidatorDialect({ id: user.id, dialectId: newDialectId }).unwrap();
      setNewDialectCountryId('');
      setNewDialectId('');
    } catch (err) {
      setValidatorDialectError(normalizeErrorMessage(err, 'Unable to assign this dialect.'));
    }
  }

  async function handleUnassignDialect(dialectId: string) {
    if (!user) return;
    setValidatorDialectError(null);
    try {
      await unassignValidatorDialect({ id: user.id, dialectId }).unwrap();
    } catch (err) {
      setValidatorDialectError(normalizeErrorMessage(err, 'Unable to remove this dialect.'));
    }
  }

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Name not provided'
    : '';
  const dialectName = useDialectName(user?.dialectTag);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Link
            className="text-sm font-bold text-accent hover:text-accent-dark"
            href="/admin/users"
          >
            &larr; Users
          </Link>
          <h1 className="text-3xl font-black">{isLoading ? 'Loading...' : displayName}</h1>
          {user && <p className="leading-relaxed text-muted">{user.email}</p>}
        </div>

        {user && (
          <>
            <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)] md:grid-cols-2 lg:grid-cols-3">
              <Field label="Role" value={user.role} />
              {user.role === 'VALIDATOR' && (
                <Field label="Validator tier" value={user.validatorLevel ?? 'Not set'} />
              )}
              {user.role === 'TRAINER' && (
                <Field
                  label="Trainer rating"
                  value={
                    user.trainerRating ? (
                      <TrainerRatingBadge rating={user.trainerRating} />
                    ) : (
                      <span className="text-muted">Not rated</span>
                    )
                  }
                />
              )}
              <Field
                label="Status"
                value={
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[user.status]}`}
                  >
                    {user.status}
                  </span>
                }
              />
              {user.onAuditHold && (
                <Field
                  label="Audit hold"
                  value={
                    <span className="rounded-lg bg-[#fff3e0] px-2.5 py-1 text-xs font-bold text-[#8a4b0f]">
                      On hold since {new Date(user.auditHoldAt!).toLocaleDateString()}
                    </span>
                  }
                />
              )}
              <Field
                label="DL balance (spendable)"
                value={
                  <span className="font-mono text-lg text-accent-dark">
                    {formatTokens(user.walletBalance ?? 0)} DL
                  </span>
                }
              />
              <Field
                label="Held (pending scoring/settlement)"
                value={
                  <span className="font-mono text-lg text-[#8a4b0f]">
                    {formatTokens(user.walletLockedBalance ?? 0)} DL
                  </span>
                }
              />
              <Field
                label="Total (balance + held)"
                value={
                  <span className="font-mono text-lg font-black text-ink">
                    {formatTokens(user.walletTotalBalance ?? user.walletBalance ?? 0)} DL
                  </span>
                }
              />
              <Field
                label="Pending scoring tokens"
                value={
                  <span className="font-mono">
                    {formatTokens(user.pendingScoringTokens ?? 0)} DL
                    <span className="ml-1.5 text-sm font-normal text-muted">
                      ({user.pendingScoringCount ?? 0} recording
                      {user.pendingScoringCount === 1 ? '' : 's'})
                    </span>
                  </span>
                }
              />
              <Field label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
              <Field label="Phone" value={user.phoneNumber ?? 'Not set'} />
              <Field
                label="Phone verified"
                value={
                  user.phoneVerified ? (
                    <span className="flex items-center gap-2">
                      Yes
                      <button
                        className="text-sm font-bold text-danger underline underline-offset-2 hover:text-danger/80"
                        onClick={() => setRevokePhoneDialogOpen(true)}
                        type="button"
                      >
                        Revoke
                      </button>
                    </span>
                  ) : (
                    'No'
                  )
                }
              />
              <Field
                label="KYC (Didit)"
                value={
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${kycStyles[user.kycStatus]}`}
                  >
                    {user.kycStatus.replace(/_/g, ' ')}
                  </span>
                }
              />
              {user.kycVerifiedAt && (
                <Field
                  label="KYC verified at"
                  value={new Date(user.kycVerifiedAt).toLocaleString()}
                />
              )}
              <Field label="Onboarding complete" value={user.onboardingComplete ? 'Yes' : 'No'} />
              <Field label="Referral code" value={user.referralCode} />
              <Field label="Dialect" value={dialectName ?? 'Not set'} />
              <Field
                label="User ID"
                value={<span className="break-all font-mono text-xs">{user.id}</span>}
              />
            </section>

            <section className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <h2 className="text-lg font-black text-amber-950">Account integrity</h2>
              {(user.potentialDuplicateNameMatches?.length ?? 0) > 0 ? (
                <>
                  <p className="text-sm leading-relaxed text-amber-900">
                    Potential same-name match. This is a review warning only; a matching name does
                    not prove the accounts belong to one person.
                  </p>
                  <div className="grid gap-2">
                    {user.potentialDuplicateNameMatches!.map((match) => (
                      <Link
                        className="grid gap-1 rounded-lg border border-amber-200 bg-white p-3 text-sm no-underline transition-colors hover:bg-amber-100"
                        href={`/admin/users/${match.id}`}
                        key={match.id}
                      >
                        <span className="font-extrabold text-ink">
                          {[match.firstName, match.lastName].filter(Boolean).join(' ') ||
                            'Name not provided'}
                        </span>
                        <span className="text-muted">{match.email}</span>
                        <span className="text-muted">
                          {match.phoneNumber ?? 'No mobile'} |{' '}
                          {match.phoneVerified ? 'Mobile verified' : 'Mobile unverified'} |{' '}
                          {match.status} | DIDIT {match.kycStatus.replace(/_/g, ' ')}
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-amber-900">
                  No potential same-name matches found. DIDIT-approved identities and mobile numbers
                  are enforced as unique.
                </p>
              )}
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
                Locking suspends or blocks the account, revokes active sessions, rejects any pending
                withdrawal, and cancels open P2P trades &mdash; reversible from this page. Deleting
                permanently removes the account and its data; the person can sign up again afterward
                as a brand-new account.
              </p>
            </section>

            {user.role === 'VALIDATOR' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <div className="grid gap-1">
                  <h2 className="text-lg font-black">Validator tier</h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Sets which approval stage this validator&rsquo;s own submitted decks route to
                    (L1 &rarr; L2 review, L2 &rarr; L3 review, L3 &rarr; admin review) and which
                    pending-approval queue they see on their own dashboard.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Validator tier">
                  {validatorLevelOptions.map((level) => {
                    const selected = user.validatorLevel === level;
                    return (
                      <button
                        aria-pressed={selected}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-extrabold transition-colors ${
                          selected
                            ? 'bg-accent text-white'
                            : 'border border-line bg-surface text-ink hover:bg-surface-muted'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        disabled={isUpdatingValidatorLevel}
                        key={level}
                        onClick={() => void handleValidatorLevel(level)}
                        type="button"
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
                {validatorLevelError && (
                  <p className="text-sm leading-relaxed text-danger" role="alert">
                    {validatorLevelError}
                  </p>
                )}
              </section>
            )}

            {user.role === 'VALIDATOR' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <div className="grid gap-1">
                  <h2 className="text-lg font-black">Onboarded dialects</h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Which dialect(s) this validator may browse recordings for and create decks
                    under. Admin-managed only &mdash; validators cannot change this themselves.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {validatorDialects && validatorDialects.length > 0 ? (
                    validatorDialects.map((d) => (
                      <span
                        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-bold"
                        key={d.dialectId}
                      >
                        {d.dialectName} ({d.countryName})
                        <button
                          aria-label={`Remove ${d.dialectName}`}
                          className="text-muted hover:text-danger"
                          onClick={() => void handleUnassignDialect(d.dialectId)}
                          type="button"
                        >
                          &times;
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-muted">No dialects assigned yet.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs font-bold text-muted">
                    Country
                    <select
                      className={inputClass}
                      onChange={(e) => {
                        setNewDialectCountryId(e.target.value);
                        setNewDialectId('');
                      }}
                      value={newDialectCountryId}
                    >
                      <option value="">Select country</option>
                      {dialectCountries?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-muted">
                    Dialect
                    <select
                      className={inputClass}
                      disabled={!newDialectCountryId}
                      onChange={(e) => setNewDialectId(e.target.value)}
                      value={newDialectId}
                    >
                      <option value="">Select dialect</option>
                      {dialectsForNewCountry?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3.5 py-1.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!newDialectId || isAssigningDialect}
                    onClick={() => void handleAssignDialect()}
                    type="button"
                  >
                    Add
                  </button>
                </div>
                {validatorDialectError && (
                  <p className="text-sm leading-relaxed text-danger" role="alert">
                    {validatorDialectError}
                  </p>
                )}
              </section>
            )}

            {user.role === 'TRAINER' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <div className="grid gap-1">
                  <h2 className="text-lg font-black">Trainer quality rating</h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Apply an administrative quality label. It is informational only and never
                    changes scoring or payouts.
                  </p>
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Trainer quality rating"
                >
                  {trainerRatingOptions.map((rating) => {
                    const selected = user.trainerRating === rating;
                    return (
                      <button
                        aria-pressed={selected}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-extrabold transition-colors ${
                          selected
                            ? trainerRatingBadgeClass(rating)
                            : 'border border-line bg-surface text-ink hover:bg-surface-muted'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        disabled={isUpdatingTrainerRating}
                        key={rating}
                        onClick={() => void handleTrainerRating(rating)}
                        type="button"
                      >
                        {trainerRatingLabel(rating)}
                        <TrainerStarRating rating={rating} size="sm" />
                      </button>
                    );
                  })}
                </div>
                {ratingError && (
                  <p className="text-sm leading-relaxed text-danger" role="alert">
                    {ratingError}
                  </p>
                )}
              </section>
            )}

            {user.role === 'TRAINER' && (
              <section className="grid gap-3 rounded-lg border border-[#f5c78e] bg-[#fff8ef] p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <h2 className="text-lg font-black text-[#8a4b0f]">Training dialect</h2>
                <p className="text-sm leading-relaxed text-[#8a4b0f]">
                  Reset this selection when the trainer must move to another dialect or sub-dialect.
                  Their country of origin and historical recordings remain unchanged. Their next
                  login starts at dialect onboarding before they can train again.
                </p>
                <div>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#f5c78e] bg-white px-4 py-2 text-sm font-bold text-[#8a4b0f] transition-colors hover:bg-[#fff3e0]"
                    onClick={() => setResetDialectDialogOpen(true)}
                    type="button"
                  >
                    Reset dialect selection
                  </button>
                </div>
              </section>
            )}

            {user.role === 'TRAINER' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <h2 className="text-lg font-black">Reports</h2>
                <p className="text-sm leading-relaxed text-muted">
                  Sends this trainer their full lifetime report by email right now &mdash;
                  recordings, average score, and DL earned &mdash; the same email they&rsquo;d
                  otherwise only get every Monday.
                </p>
                <div>
                  <ActionButton
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleSendReport}
                    pending={isSendingReport}
                    pendingLabel="Sending"
                    type="button"
                  >
                    Send report now
                  </ActionButton>
                </div>
                {reportMessage && (
                  <p className="text-sm leading-relaxed text-accent-dark">{reportMessage}</p>
                )}
                {reportError && (
                  <p className="text-sm leading-relaxed text-danger" role="alert">
                    {reportError}
                  </p>
                )}
              </section>
            )}

            {user.role === 'TRAINER' && user.onAuditHold && (
              <section className="grid gap-3 rounded-lg border border-[#f5c78e] bg-[#fff8ef] p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <h2 className="text-lg font-black text-[#8a4b0f]">
                  Account on automatic audit hold
                </h2>
                <p className="text-sm leading-relaxed text-[#8a4b0f]">
                  This trainer&rsquo;s submission count reached the platform&rsquo;s audit-hold
                  threshold on {new Date(user.auditHoldAt!).toLocaleString()}. They cannot start new
                  training tasks until this hold is released. This is separate from account lock
                  status &mdash; releasing it does not change ACTIVE/SUSPENDED/BLOCKED.
                </p>
                <div>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark"
                    onClick={() => setReleaseHoldDialogOpen(true)}
                    type="button"
                  >
                    Release audit hold
                  </button>
                </div>
              </section>
            )}

            {user.role === 'TRAINER' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <h2 className="text-lg font-black">Recording audit</h2>
                <p className="text-sm leading-relaxed text-muted">
                  Play through this trainer&rsquo;s recordings one at a time and mark each as valid
                  or invalid. Marking a paid-out recording invalid can optionally claw back its DL
                  payout.
                </p>
                <div>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark"
                    onClick={() => setAuditDialogOpen(true)}
                    type="button"
                  >
                    Audit recordings
                  </button>
                </div>
              </section>
            )}

            {user.role === 'TRAINER' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <div className="grid gap-1">
                  <h2 className="text-lg font-black">Pending scoring</h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Recordings whose stake is still held: awaiting the scoring pipeline (PENDING) or
                    scored but not yet paid out by the settlement job (SCORED). Settling a SCORED
                    row here pays it out immediately using the same formula the automated job uses.
                  </p>
                </div>
                <DataTable
                  adjustablePageSize
                  columns={pendingScoringColumns}
                  emptyMessage="Nothing held for this trainer right now."
                  isLoading={isLoadingPendingScoring}
                  pageSize={5}
                  rowKey={(row) => row.id}
                  rows={pendingScoring?.items ?? []}
                  searchPlaceholder="Search by score or status..."
                />
                {pendingScoring && pendingScoring.totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                    <p className="text-sm text-muted">
                      Server page {pendingScoring.page} of {pendingScoring.totalPages} &middot;{' '}
                      {pendingScoring.total} total
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pendingScoringPage <= 1}
                        onClick={() => setPendingScoringPage((p) => Math.max(1, p - 1))}
                        type="button"
                      >
                        Previous
                      </button>
                      <button
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pendingScoringPage >= pendingScoring.totalPages}
                        onClick={() => setPendingScoringPage((p) => p + 1)}
                        type="button"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <h2 className="text-lg font-black">Token transactions</h2>
              <DataTable
                adjustablePageSize
                columns={activityColumns}
                emptyMessage="No transactions yet."
                isLoading={isLoadingActivity}
                pageSize={5}
                rowKey={(entry) => entry.id}
                rows={activity?.items ?? []}
                searchPlaceholder="Search by type or amount..."
              />
              {activity && activity.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                  <p className="text-sm text-muted">
                    Server page {activity.page} of {activity.totalPages} &middot; {activity.total}{' '}
                    total
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={activityBatch <= 1}
                      onClick={() => setActivityBatch((p) => Math.max(1, p - 1))}
                      type="button"
                    >
                      Previous
                    </button>
                    <button
                      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={activityBatch >= activity.totalPages}
                      onClick={() => setActivityBatch((p) => p + 1)}
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
      {user && releaseHoldDialogOpen && (
        <ReleaseAuditHoldDialog user={user} onClose={() => setReleaseHoldDialogOpen(false)} />
      )}
      {user && revokePhoneDialogOpen && (
        <RevokePhoneVerificationDialog
          user={user}
          onClose={() => setRevokePhoneDialogOpen(false)}
        />
      )}
      {user && deleteDialogOpen && (
        <DeleteUserDialog
          user={user}
          onClose={() => setDeleteDialogOpen(false)}
          onDeleted={() => router.push('/admin/users')}
        />
      )}
      {user && resetDialectDialogOpen && (
        <ResetDialectDialog user={user} onClose={() => setResetDialectDialogOpen(false)} />
      )}
      {user && (
        <RecordingAuditDialog
          onOpenChange={setAuditDialogOpen}
          open={auditDialogOpen}
          trainerId={user.id}
          trainerName={displayName || user.email}
        />
      )}
    </AdminShell>
  );
}

function ResetDialectDialog({
  user,
  onClose,
}: {
  user: { id: string; email: string; dialectTag: string | null; dialectVariantTag: string | null };
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [resetDialect, { isLoading }] = useResetUserDialectMutation();

  async function handleReset() {
    setError(null);
    try {
      await resetDialect(user.id).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, "Unable to reset this trainer's dialect selection."));
    }
  }

  const currentSelection = [user.dialectTag, user.dialectVariantTag].filter(Boolean).join(' / ');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Reset training dialect"
        description={`Remove ${user.email}'s current selection${currentSelection ? ` (${currentSelection})` : ''}.`}
      >
        <div className="grid gap-4">
          <p className="text-sm leading-relaxed text-muted">
            This immediately blocks new training under the old dialect, keeps historical recordings,
            and revokes active refresh sessions. The trainer must select an active dialect again at
            their next login.
          </p>
          {error && (
            <p className="text-sm leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleReset()}
              pending={isLoading}
              pendingLabel="Resetting"
              type="button"
            >
              Reset selection
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function TrainerRatingBadge({ rating }: { rating: TrainerRating }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${trainerRatingBadgeClass(rating)}`}
    >
      {trainerRatingLabel(rating)}
      <TrainerStarRating rating={rating} size="sm" />
    </span>
  );
}

const activityColumns: DataTableColumn<UserActivityEntry>[] = [
  {
    key: 'date',
    header: 'Date',
    render: (entry) => (
      <span className="text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
    ),
    sortValue: (entry) => entry.createdAt,
  },
  {
    key: 'type',
    header: 'Type',
    render: (entry) => <span className="font-bold">{activityLabels[entry.type]}</span>,
    sortValue: (entry) => activityLabels[entry.type],
  },
  {
    key: 'amount',
    header: 'Amount',
    render: (entry) => {
      const isCredit = Number(entry.amount) >= 0;
      return (
        <span className={`font-bold ${isCredit ? 'text-accent-dark' : 'text-danger'}`}>
          {isCredit ? '+' : ''}
          {formatTokens(entry.amount)} DL
        </span>
      );
    },
    sortValue: (entry) => Number(entry.amount),
  },
];

const pendingScoringColumns: DataTableColumn<UnsettledRow>[] = [
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <span
        className={`rounded-md px-2 py-1 text-xs font-black ${
          row.status === 'PENDING'
            ? 'bg-slate-100 text-slate-700'
            : row.pendingDelay
              ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-danger'
        }`}
      >
        {row.status === 'PENDING'
          ? 'Awaiting scoring'
          : row.pendingDelay
            ? 'Pending delay'
            : 'Stuck'}
      </span>
    ),
    sortValue: (row) => row.status,
  },
  {
    key: 'tokensSpent',
    header: 'Tokens held',
    render: (row) => <span className="font-mono">{formatTokens(row.tokensSpent)} DL</span>,
    sortValue: (row) => Number(row.tokensSpent),
  },
  {
    key: 'score',
    header: 'Score',
    render: (row) => row.score ?? '—',
    sortValue: (row) => (row.score ? Number(row.score) : -1),
  },
  {
    key: 'scoredAt',
    header: 'Scored at',
    render: (row) =>
      row.status === 'PENDING' ? (
        <span className="text-muted">Not yet scored</span>
      ) : (
        new Date(row.scoredAt).toLocaleString()
      ),
    sortValue: (row) => row.scoredAt,
  },
  {
    key: 'actions',
    header: 'Actions',
    render: (row) => <SettleAction row={row} />,
    searchable: false,
  },
];

function SettleAction({ row }: { row: UnsettledRow }) {
  const [settleOne, { isLoading }] = useSettleOneMutation();
  const [error, setError] = useState('');

  async function handleSettle(force: boolean) {
    setError('');
    try {
      await settleOne({ id: row.id, force }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not settle this recording'));
    }
  }

  if (row.status === 'PENDING') {
    return <span className="text-xs text-muted">Not yet scored</span>;
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-1.5">
        <ActionButton
          className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold disabled:opacity-50"
          onClick={() => void handleSettle(false)}
          pending={isLoading}
          pendingLabel="Settling"
          type="button"
        >
          Settle
        </ActionButton>
        {row.pendingDelay && (
          <ActionButton
            className="min-h-8 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-extrabold text-amber-800 disabled:opacity-50"
            onClick={() => void handleSettle(true)}
            pending={isLoading}
            pendingLabel="Settling"
            type="button"
          >
            Force
          </ActionButton>
        )}
      </div>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

function LockUserDialog({
  user,
  onClose,
}: {
  user: { id: string; status: string };
  onClose: () => void;
}) {
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
      await lockUser({
        id: user.id,
        status,
        ...(otpRequestId ? { otpRequestId, code } : {}),
      }).unwrap();
      onClose();
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Unable to verify this code.' : 'Unable to update this account.',
        ),
      );
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          title="Enter your code"
          description="We emailed a 6-digit code to confirm this action."
        >
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
            <select
              className={inputClass}
              id="lock-status"
              onChange={(e) => setStatus(e.target.value)}
              value={status}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>
          {status !== 'ACTIVE' && (
            <p className="text-sm leading-relaxed text-muted">
              This revokes active sessions, rejects any pending withdrawal (returning the DL to
              their wallet), and cancels open P2P offers/trades (returning escrowed DL).
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
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Unable to verify this code.' : 'Unable to delete this account.',
        ),
      );
    }
  }

  if (otpRequestId) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          title="Enter your code"
          description="We emailed a 6-digit code to confirm this permanent deletion."
        >
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
            <input
              className={inputClass}
              id="confirm-email"
              onChange={(e) => setConfirmText(e.target.value)}
              value={confirmText}
            />
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
