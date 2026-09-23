'use client';

import { useState } from 'react';
import { AlertCircle, BadgeCheck, FileSignature, KeyRound, PauseCircle, RotateCcw } from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { alertTone, fieldClass, primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';
import {
  normalizeErrorMessage,
  useCountersignVdclVersionMutation,
  useGetVdclAgreementsQuery,
  useReinstateVdclVersionMutation,
  useReissueVdclDocumentsMutation,
  useRequestVdclCountersignOtpMutation,
  useSuspendVdclVersionMutation,
  useWithdrawVdclAgreementMutation,
  type VdclAgreementSummary,
} from '@/store/api';

/**
 * Admin lifecycle control over VDCL agreements.
 *
 * The backend has had activate/suspend/reinstate/withdraw since Phase 0,
 * but nothing in the UI called them -- countersignature, the single most
 * consequential action in the product, was reachable only by hand-crafting
 * an authenticated POST. This is that surface.
 *
 * Contributor identity is visible here. Dialect Library sits in the middle
 * and is the only party that sees both halves; none of this may be reused
 * on a subscriber- or contributor-facing route.
 */
export function VdclAgreementsPanel() {
  const { data, isLoading } = useGetVdclAgreementsQuery();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section className={`${cardClass} p-5`}>
      <h2 className="text-lg font-black text-ink">Agreements</h2>
      <p className="mt-1 text-sm text-muted">
        Every contributor licence, and the actions available on each. Countersigning is what
        actually grants rights — until then a signed licence permits nothing.
      </p>

      {error ? (
        <p className={`mt-3 flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.danger}`}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={`mt-3 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.success}`}>
          {notice}
        </p>
      ) : null}

      {isLoading ? <p className="mt-4 text-sm text-muted">Loading agreements...</p> : null}

      {data && data.length === 0 ? (
        <p className="mt-4 rounded-lg border border-line bg-surface-muted px-3.5 py-3 text-sm text-muted">
          No agreements yet. One appears here once a contributor starts a licence from their
          dashboard.
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3">
        {data?.map((agreement) => (
          <AgreementRow
            key={agreement.id}
            agreement={agreement}
            onError={setError}
            onNotice={setNotice}
          />
        ))}
      </ul>
    </section>
  );
}

function AgreementRow({
  agreement,
  onError,
  onNotice,
}: {
  agreement: VdclAgreementSummary;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [requestOtp, otpState] = useRequestVdclCountersignOtpMutation();
  const [countersign, signState] = useCountersignVdclVersionMutation();
  const [suspend, suspendState] = useSuspendVdclVersionMutation();
  const [reinstate, reinstateState] = useReinstateVdclVersionMutation();
  const [withdraw, withdrawState] = useWithdrawVdclAgreementMutation();
  const [reissue, reissueState] = useReissueVdclDocumentsMutation();

  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const version = agreement.activeVersion;
  const status = version?.status;
  const pendingCountersign = status === 'PENDING_COUNTERSIGNATURE';

  function run(fn: () => Promise<unknown>, success: string, fallback: string) {
    onError(null);
    onNotice(null);
    return fn()
      .then(() => onNotice(success))
      .catch((err) => onError(normalizeErrorMessage(err, fallback)));
  }

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="font-mono text-sm font-bold text-ink">{agreement.licenceKey}</span>
          <span className="text-xs text-muted">
            {agreement._count.versions} version(s)
            {version ? ` · v${version.version}` : ''}
          </span>
        </div>
        <StatusPill
          status={agreement.withdrawnAt ? 'WITHDRAWN' : (status ?? 'NO ACTIVE VERSION')}
        />
      </div>

      {agreement.withdrawnAt ? (
        <p className="mt-3 text-sm text-muted">
          Withdrawn {new Date(agreement.withdrawnAt).toLocaleDateString()}. Withdrawal is the
          contributor&apos;s decision and cannot be reversed here.
        </p>
      ) : null}

      {/* Countersignature carries an OTP step-up, like every other
          consequential admin action in this codebase. */}
      {pendingCountersign ? (
        <div className="mt-4 rounded-lg border border-accent/30 bg-accent-soft p-3.5">
          <p className="flex items-center gap-2 text-sm font-black text-accent">
            <FileSignature className="size-4" aria-hidden="true" />
            Awaiting Dialect Library countersignature
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The contributor signed{' '}
            {version?.signedAt ? new Date(version.signedAt).toLocaleDateString() : ''}. This grants
            commercial rights over their recordings and issues their licence documents.
          </p>

          {!otpRequestId ? (
            <ActionButton
              className={`${primaryButton} mt-3`}
              pending={otpState.isLoading}
              pendingLabel="Sending code..."
              disabled={otpState.isLoading}
              onClick={() =>
                run(
                  () =>
                    requestOtp(version!.id)
                      .unwrap()
                      .then((r) => setOtpRequestId(r.otpRequestId)),
                  'Confirmation code sent.',
                  'Could not send the confirmation code.',
                )
              }
            >
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4" aria-hidden="true" />
                Send me a confirmation code
              </span>
            </ActionButton>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold text-ink" htmlFor={`code-${agreement.id}`}>
                  Confirmation code
                </label>
                <input
                  id={`code-${agreement.id}`}
                  className={`${fieldClass} max-w-40 font-mono tracking-[0.3em]`}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </div>
              <ActionButton
                className={primaryButton}
                disabled={!code.trim() || signState.isLoading}
                pending={signState.isLoading}
                pendingLabel="Countersigning..."
                onClick={() =>
                  run(
                    () =>
                      countersign({ id: version!.id, otpRequestId, code })
                        .unwrap()
                        .then(() => {
                          setOtpRequestId(null);
                          setCode('');
                        }),
                    'Countersigned. The licence is now active and its documents have been issued.',
                    'Could not countersign this licence.',
                  )
                }
              >
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="size-4" aria-hidden="true" />
                  Countersign
                </span>
              </ActionButton>
            </div>
          )}
        </div>
      ) : null}

      {status === 'ACTIVE' || status === 'SUSPENDED' ? (
        <div className="mt-4 grid gap-2">
          <label className="text-xs font-bold text-ink" htmlFor={`reason-${agreement.id}`}>
            Reason (required — the audit row is the only record of why)
          </label>
          <input
            id={`reason-${agreement.id}`}
            className={fieldClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. disputed ownership, compliance review"
          />
          <div className="flex flex-wrap gap-2">
            {status === 'ACTIVE' ? (
              <ActionButton
                className={secondaryButton}
                disabled={reason.trim().length < 3 || suspendState.isLoading}
                pending={suspendState.isLoading}
                onClick={() =>
                  run(
                    () => suspend({ id: version!.id, reason }).unwrap().then(() => setReason('')),
                    'Suspended. Streaming stops immediately.',
                    'Could not suspend this licence.',
                  )
                }
              >
                <span className="inline-flex items-center gap-2">
                  <PauseCircle className="size-4" aria-hidden="true" />
                  Suspend
                </span>
              </ActionButton>
            ) : (
              <ActionButton
                className={secondaryButton}
                disabled={reinstateState.isLoading}
                pending={reinstateState.isLoading}
                onClick={() =>
                  run(
                    () => reinstate(version!.id).unwrap(),
                    'Reinstated. The licence grants again.',
                    'Could not reinstate this licence.',
                  )
                }
              >
                <span className="inline-flex items-center gap-2">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reinstate
                </span>
              </ActionButton>
            )}

            <ActionButton
              className={secondaryButton}
              disabled={reissueState.isLoading}
              pending={reissueState.isLoading}
              onClick={() =>
                run(
                  () => reissue(version!.id).unwrap(),
                  'Documents re-issued. The stored hashes have changed.',
                  'Could not re-issue the documents.',
                )
              }
            >
              Re-issue documents
            </ActionButton>
          </div>
        </div>
      ) : null}

      {/* Withdrawal is the CONTRIBUTOR's decision. This actions one received
          off-platform until the contributor control ships -- it is not an
          admin revoke tool, which is what suspend is for. The confirm step
          exists so nobody reaches for it by accident. */}
      {!agreement.withdrawnAt ? (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-bold text-muted">
            Action a withdrawal request
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Only for a withdrawal the contributor asked for off-platform (support ticket, email).
            To revoke a licence on Dialect Library&apos;s own initiative, use suspend instead.
            Withdrawal cannot be reversed here.
          </p>
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={confirmWithdraw}
              onChange={(e) => setConfirmWithdraw(e.target.checked)}
            />
            I confirm this contributor requested withdrawal.
          </label>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              className={`${fieldClass} max-w-md`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Where the request came from"
            />
            <ActionButton
              className={secondaryButton}
              disabled={!confirmWithdraw || reason.trim().length < 3 || withdrawState.isLoading}
              pending={withdrawState.isLoading}
              onClick={() =>
                run(
                  () =>
                    withdraw({ id: agreement.id, reason })
                      .unwrap()
                      .then(() => {
                        setReason('');
                        setConfirmWithdraw(false);
                      }),
                  'Withdrawal recorded. Access stops immediately.',
                  'Could not record the withdrawal.',
                )
              }
            >
              Record withdrawal
            </ActionButton>
          </div>
        </details>
      ) : null}
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-accent text-white'
      : status === 'WITHDRAWN' || status === 'REJECTED'
        ? 'bg-danger/15 text-danger'
        : status === 'SUSPENDED'
          ? 'bg-warning/15 text-warning'
          : 'bg-surface-muted text-muted';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}
