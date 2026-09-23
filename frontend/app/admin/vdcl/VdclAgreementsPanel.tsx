'use client';

import { useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  FileSignature,
  KeyRound,
  PauseCircle,
  RotateCcw,
  ShieldX,
} from 'lucide-react';
import { OtpGuardedAction } from './OtpGuardedAction';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { alertTone, fieldClass, primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';
import {
  normalizeErrorMessage,
  useCountersignVdclVersionMutation,
  useGetVdclAgreementsQuery,
  useLazyGetAdminVdclDocumentLinkQuery,
  useReinstateVdclVersionMutation,
  useReissueVdclDocumentsMutation,
  useRequestVdclActionOtpMutation,
  useRequestVdclCountersignOtpMutation,
  useRevokeVdclCountersignatureMutation,
  useSuspendVdclVersionMutation,
  useWithdrawVdclAgreementMutation,
  type VdclAdminActionName,
  type VdclAgreementSummary,
} from '@/store/api';

/**
 * Admin lifecycle control over VDCL agreements.
 *
 * Countersignature is the point of this screen, and it used to be the one
 * thing it could not do. The row rendered from `activeVersion`, which is
 * null until countersignature happens -- so a licence sitting in
 * PENDING_COUNTERSIGNATURE showed "no active version" and offered a
 * withdrawal form as its only action. An admin arriving to countersign was
 * shown the control for the contributor's own decision instead.
 *
 * So the row now renders from the latest version whatever its status, and
 * the actions are ordered by what the licence actually needs: countersign
 * first when it is waiting, then the certificate once issued, then the
 * corrective actions, with withdrawal last and folded away because it is
 * not ours to take.
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
  const [revoke, revokeState] = useRevokeVdclCountersignatureMutation();
  const [withdraw, withdrawState] = useWithdrawVdclAgreementMutation();
  const [reissue, reissueState] = useReissueVdclDocumentsMutation();
  const [fetchDocument, documentState] = useLazyGetAdminVdclDocumentLinkQuery();
  const [requestActionOtp] = useRequestVdclActionOtpMutation();

  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  // The version to act on: the active one when there is one, otherwise the
  // latest. Reading activeVersion alone is what hid every licence awaiting
  // countersignature from this panel.
  const version = agreement.activeVersion ?? agreement.latestVersion;
  const status = version?.status;
  const pendingCountersign = status === 'PENDING_COUNTERSIGNATURE';
  const hasDocuments = Boolean(version?.pdfKey || version?.pngKey);

  /**
   * Issues a code for a licence action. Surfaces a failure as the panel
   * error rather than leaving the control stuck on "Sending code...".
   */
  function requestCode(scope: 'versions' | 'agreements', id: string) {
    return (action: VdclAdminActionName) => {
      onError(null);
      onNotice(null);
      return requestActionOtp({ scope, id, action })
        .unwrap()
        .then((r) => {
          onNotice('Confirmation code sent.');
          return r.otpRequestId;
        })
        .catch((err) => {
          onError(normalizeErrorMessage(err, 'Could not send the confirmation code.'));
          throw err;
        });
    };
  }

  function run(fn: () => Promise<unknown>, success: string, fallback: string) {
    onError(null);
    onNotice(null);
    return fn()
      .then(() => onNotice(success))
      .catch((err) => onError(normalizeErrorMessage(err, fallback)));
  }

  /** Opens the signed document in a new tab via its short-lived signed URL. */
  function openDocument(kind: 'pdf' | 'png') {
    return run(
      () =>
        fetchDocument({ id: version!.id, kind })
          .unwrap()
          .then((link) => {
            window.open(link.url, '_blank', 'noopener,noreferrer');
          }),
      `Opened the ${kind.toUpperCase()}.`,
      `Could not open the ${kind.toUpperCase()}.`,
    );
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
          status={agreement.withdrawnAt ? 'WITHDRAWN' : (status ?? 'NO VERSION YET')}
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
            {version?.signedAt ? new Date(version.signedAt).toLocaleDateString() : ''}. Countersigning
            on behalf of Golojan Technologies LLC grants commercial rights over their recordings and
            issues their licence documents.
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

      {/* Why this version was sent back. Shown to the admin too, so whoever
          picks it up next can see what was asked for without digging
          through the audit log. */}
      {version?.rejectionReason ? (
        <div className={`mt-4 rounded-lg px-3.5 py-3 text-sm ${alertTone.warning}`}>
          <p className="font-black">Countersignature revoked</p>
          <p className="mt-1 leading-relaxed">{version.rejectionReason}</p>
          <p className="mt-1 text-xs opacity-80">
            The contributor can see this and sign a new version.
            {version.rejectedAt ? ` Revoked ${new Date(version.rejectedAt).toLocaleString()}.` : ''}
          </p>
        </div>
      ) : null}

      {/* The certificate, exactly as the contributor sees it. Only after
          documents exist -- they are issued at countersignature, so before
          that there is nothing to show. */}
      {hasDocuments ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton
            className={primaryButton}
            disabled={documentState.isLoading}
            pending={documentState.isLoading}
            pendingLabel="Opening..."
            onClick={() => openDocument('png')}
          >
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="size-4" aria-hidden="true" />
              View certificate
            </span>
          </ActionButton>
          <ActionButton
            className={secondaryButton}
            disabled={documentState.isLoading}
            onClick={() => openDocument('pdf')}
          >
            Download licence PDF
          </ActionButton>
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
          <div className="flex flex-wrap items-end gap-3">
            {status === 'ACTIVE' ? (
              <OtpGuardedAction
                action="vdcl-suspend"
                disabled={reason.trim().length < 3}
                icon={<PauseCircle className="size-4" aria-hidden="true" />}
                label="Suspend"
                onConfirm={(step) =>
                  run(
                    () =>
                      suspend({ id: version!.id, reason, ...step })
                        .unwrap()
                        .then(() => setReason('')),
                    'Suspended. Streaming stops immediately.',
                    'Could not suspend this licence.',
                  )
                }
                onRequestCode={requestCode('versions', version!.id)}
                pending={suspendState.isLoading}
              />
            ) : (
              <OtpGuardedAction
                action="vdcl-reinstate"
                icon={<RotateCcw className="size-4" aria-hidden="true" />}
                label="Reinstate"
                onConfirm={(step) =>
                  run(
                    () => reinstate({ id: version!.id, ...step }).unwrap(),
                    'Reinstated. The licence grants again.',
                    'Could not reinstate this licence.',
                  )
                }
                onRequestCode={requestCode('versions', version!.id)}
                pending={reinstateState.isLoading}
              />
            )}

            <OtpGuardedAction
              action="vdcl-reissue"
              label="Re-issue documents"
              onConfirm={(step) =>
                run(
                  () => reissue({ id: version!.id, ...step }).unwrap(),
                  'Documents re-issued. The stored hashes have changed.',
                  'Could not re-issue the documents.',
                )
              }
              onRequestCode={requestCode('versions', version!.id)}
              pending={reissueState.isLoading}
            />
          </div>
        </div>
      ) : null}

      {/* Revoke: undo OUR signature and tell the contributor what to fix.
          Distinct from suspend (an internal hold that says nothing to them)
          and from withdrawal (theirs alone). The reason is mandatory
          because a rejection they cannot act on is a dead end. */}
      {status === 'ACTIVE' || status === 'SUSPENDED' || pendingCountersign ? (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-bold text-muted">
            Revoke countersignature and send back
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Withdraws Dialect Library&apos;s signature and returns the licence to the contributor
            with your reason. Their own signature stays on the record; the licence grants nothing
            until they address this and sign a new version.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <input
              className={`${fieldClass} max-w-md`}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="What the contributor needs to fix"
            />
            <OtpGuardedAction
              action="vdcl-revoke"
              disabled={revokeReason.trim().length < 3}
              icon={<ShieldX className="size-4" aria-hidden="true" />}
              label="Revoke countersignature"
              onConfirm={(step) =>
                run(
                  () =>
                    revoke({ id: version!.id, reason: revokeReason, ...step })
                      .unwrap()
                      .then(() => setRevokeReason('')),
                  'Countersignature revoked. The contributor can see why and sign a new version.',
                  'Could not revoke the countersignature.',
                )
              }
              onRequestCode={requestCode('versions', version!.id)}
              pending={revokeState.isLoading}
              pendingLabel="Revoking..."
            />
          </div>
        </details>
      ) : null}

      {/* Withdrawal is the CONTRIBUTOR's decision. This actions one received
          off-platform -- it is not an admin revoke tool, which is what the
          control above is for. The confirm step exists so nobody reaches
          for it by accident. */}
      {!agreement.withdrawnAt ? (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-bold text-muted">
            Action a withdrawal request
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Only for a withdrawal the contributor asked for off-platform (support ticket, email).
            To revoke on Dialect Library&apos;s own initiative, use the control above. Withdrawal
            cannot be reversed here.
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
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <input
              className={`${fieldClass} max-w-md`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Where the request came from"
            />
            <OtpGuardedAction
              action="vdcl-withdraw"
              disabled={!confirmWithdraw || reason.trim().length < 3}
              label="Record withdrawal"
              onConfirm={(step) =>
                run(
                  () =>
                    withdraw({ id: agreement.id, reason, ...step })
                      .unwrap()
                      .then(() => {
                        setReason('');
                        setConfirmWithdraw(false);
                      }),
                  'Withdrawal recorded. Access stops immediately.',
                  'Could not record the withdrawal.',
                )
              }
              onRequestCode={requestCode('agreements', agreement.id)}
              pending={withdrawState.isLoading}
            />
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
          : status === 'PENDING_COUNTERSIGNATURE'
            ? 'bg-accent-soft text-accent'
            : 'bg-surface-muted text-muted';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}
