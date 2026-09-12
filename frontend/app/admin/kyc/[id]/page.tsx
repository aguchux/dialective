'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { ProviderBadge, StatusBadge, formatDateTime } from '../kyc-shared';
import {
  normalizeErrorMessage,
  useApproveKycVerificationMutation,
  useCancelKycVerificationMutation,
  useDeclineKycVerificationMutation,
  useGetKycVerificationQuery,
  useLazyGetKycDecisionQuery,
  useLazyGetKycEvidenceImageQuery,
  useListKycEvidenceQuery,
  useRefreshKycVerificationMutation,
  useRevokeKycVerificationMutation,
} from '@/store/api';

export default function AdminKycDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { data: row, isLoading } = useGetKycVerificationQuery(id);
  const [refresh, { isLoading: refreshing }] = useRefreshKycVerificationMutation();
  const [cancel, { isLoading: cancelling }] = useCancelKycVerificationMutation();
  const [approve, { isLoading: approving }] = useApproveKycVerificationMutation();
  const [decline, { isLoading: declining }] = useDeclineKycVerificationMutation();
  const [revoke, { isLoading: revoking }] = useRevokeKycVerificationMutation();
  const [fetchDecision, { data: decisionData, isFetching: loadingDecision }] =
    useLazyGetKycDecisionQuery();
  const [error, setError] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [showRevokeForm, setShowRevokeForm] = useState(false);
  const [decisionRevealed, setDecisionRevealed] = useState(false);

  useEffect(() => {
    setDecisionRevealed(false);
    setError(null);
    setShowDeclineForm(false);
    setDeclineReason('');
    setShowRevokeForm(false);
    setRevokeReason('');
  }, [id]);

  async function refreshRow() {
    setError(null);
    try {
      await refresh(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to refresh this verification.'));
    }
  }

  async function cancelRow() {
    setError(null);
    try {
      await cancel(id).unwrap();
      router.push('/admin/kyc');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to cancel this verification.'));
    }
  }

  async function approveRow() {
    setError(null);
    try {
      await approve(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to approve this verification.'));
    }
  }

  async function declineRow() {
    if (!declineReason.trim()) return;
    setError(null);
    try {
      await decline({ id, reason: declineReason.trim() }).unwrap();
      setShowDeclineForm(false);
      setDeclineReason('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to decline this verification.'));
    }
  }

  async function revokeRow() {
    if (!revokeReason.trim()) return;
    setError(null);
    try {
      await revoke({ id, reason: revokeReason.trim() }).unwrap();
      setShowRevokeForm(false);
      setRevokeReason('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to revoke this verification.'));
    }
  }

  async function revealDecision() {
    setError(null);
    try {
      await fetchDecision(id).unwrap();
      setDecisionRevealed(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to load the decision payload.'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Link className="text-sm font-bold text-accent hover:text-accent-dark" href="/admin/kyc">
            &larr; Identity verification
          </Link>
          <h1 className="text-3xl font-black">
            {isLoading
              ? 'Loading...'
              : row
                ? [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email
                : 'Verification not found'}
          </h1>
          {row && (
            <p className="leading-relaxed text-muted">
              {row.user.email}
              {row.user.phoneNumber ? ` · ${row.user.phoneNumber}` : ''}
            </p>
          )}
        </div>

        {row && (
          <>
            <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)] md:grid-cols-2 lg:grid-cols-4">
              <DetailField label="Status" value={<StatusBadge status={row.status} />} />
              <DetailField label="Provider" value={<ProviderBadge provider={row.provider} />} />
              <DetailField label="Document type" value={row.documentType ?? '--'} />
              <DetailField label="Document number" value={row.documentNumberMasked ?? '--'} />
              <DetailField label="Face match score" value={row.faceMatchScore ?? '--'} />
              <DetailField label="Liveness score" value={row.livenessScore ?? '--'} />
              <DetailField label="Submitted" value={formatDateTime(row.createdAt)} />
              <DetailField
                label="Webhook received"
                value={row.webhookReceivedAt ? formatDateTime(row.webhookReceivedAt) : 'Not yet'}
              />
            </section>

            {row.declineReason && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-danger">
                Decline reason: {row.declineReason}
              </p>
            )}

            {row.provider === 'self' && (
              <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
                <h2 className="text-lg font-black">Captured evidence</h2>
                <EvidencePanel verificationId={row.id} />
              </section>
            )}

            <section className="grid gap-2 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <h2 className="text-lg font-black">Decrypted decision</h2>
              <p className="text-sm leading-relaxed text-muted">
                Only the masked/summary fields are shown above by default -- the full decision
                payload is encrypted at rest. Viewing it is logged.
              </p>
              {!decisionRevealed ? (
                <ActionButton
                  className="min-h-9 w-fit rounded-lg border border-line px-3 font-bold hover:bg-surface-muted disabled:opacity-60"
                  onClick={() => void revealDecision()}
                  pending={loadingDecision}
                  pendingLabel="Decrypting"
                  type="button"
                >
                  View decrypted decision
                </ActionButton>
              ) : (
                <BotFindingsPanel botFindings={decisionData?.raw?.botFindings ?? null} />
              )}
              <p className="text-xs text-muted">
                LLM-assisted findings are a reviewer aid only -- never treat them as verified fact.
              </p>
            </section>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-danger" role="alert">
                {error}
              </p>
            )}

            <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <h2 className="text-lg font-black">Actions</h2>
              {row.status === 'IN_PROGRESS' || row.status === 'IN_REVIEW' ? (
                <div className="flex flex-wrap gap-2">
                  {row.provider === 'didit' && (
                    <ActionButton
                      className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:opacity-60"
                      onClick={() => void refreshRow()}
                      pending={refreshing}
                      pendingLabel="Refreshing"
                      type="button"
                    >
                      Refresh from Didit
                    </ActionButton>
                  )}
                  <ActionButton
                    className="min-h-11 rounded-lg border border-danger px-5 font-extrabold text-danger hover:bg-red-50 disabled:opacity-60"
                    onClick={() => void cancelRow()}
                    pending={cancelling}
                    pendingLabel="Cancelling"
                    type="button"
                  >
                    Cancel verification
                  </ActionButton>
                  {row.provider === 'self' && (
                    <>
                      <ActionButton
                        className="min-h-11 rounded-lg border border-accent bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-60"
                        onClick={() => void approveRow()}
                        pending={approving}
                        pendingLabel="Approving"
                        type="button"
                      >
                        Approve
                      </ActionButton>
                      <ActionButton
                        className="min-h-11 rounded-lg border border-danger px-5 font-extrabold text-danger hover:bg-red-50 disabled:opacity-60"
                        onClick={() => setShowDeclineForm((current) => !current)}
                        type="button"
                      >
                        Decline
                      </ActionButton>
                    </>
                  )}
                </div>
              ) : row.status === 'APPROVED' ? (
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    className="min-h-11 rounded-lg border border-danger px-5 font-extrabold text-danger hover:bg-red-50 disabled:opacity-60"
                    onClick={() => setShowRevokeForm((current) => !current)}
                    type="button"
                  >
                    Revoke approval
                  </ActionButton>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  This verification is {row.status.replace(/_/g, ' ').toLowerCase()} -- no further
                  actions available.
                </p>
              )}
              {showDeclineForm && (
                <div className="grid gap-2 rounded-lg border border-line bg-surface-muted p-3">
                  <label className="text-sm font-bold" htmlFor="kyc-decline-reason">
                    Reason for declining (shown to the trainer)
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    id="kyc-decline-reason"
                    onChange={(event) => setDeclineReason(event.target.value)}
                    value={declineReason}
                  />
                  <div>
                    <ActionButton
                      className="min-h-10 rounded-lg border border-danger bg-danger px-4 font-extrabold text-white disabled:opacity-60"
                      disabled={!declineReason.trim()}
                      onClick={() => void declineRow()}
                      pending={declining}
                      pendingLabel="Declining"
                      type="button"
                    >
                      Confirm decline
                    </ActionButton>
                  </div>
                </div>
              )}
              {showRevokeForm && (
                <div className="grid gap-2 rounded-lg border border-line bg-surface-muted p-3">
                  <label className="text-sm font-bold" htmlFor="kyc-revoke-reason">
                    Reason for revoking (shown to the trainer; also re-blocks withdrawals/onboarding
                    immediately)
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    id="kyc-revoke-reason"
                    onChange={(event) => setRevokeReason(event.target.value)}
                    value={revokeReason}
                  />
                  <div>
                    <ActionButton
                      className="min-h-10 rounded-lg border border-danger bg-danger px-4 font-extrabold text-white disabled:opacity-60"
                      disabled={!revokeReason.trim()}
                      onClick={() => void revokeRow()}
                      pending={revoking}
                      pendingLabel="Revoking"
                      type="button"
                    >
                      Confirm revoke
                    </ActionButton>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function EvidencePanel({ verificationId }: { verificationId: string }) {
  const { data: evidence, isLoading } = useListKycEvidenceQuery(verificationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted">Loading evidence...</p>;
  if (!evidence || evidence.length === 0) {
    return <p className="text-sm text-muted">No captured evidence on file.</p>;
  }

  const kindLabel: Record<string, string> = {
    DOCUMENT_FRONT: 'Document (front)',
    DOCUMENT_BACK: 'Document (back)',
    SELFIE_FRAME: 'Selfie frame',
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {evidence.map((item) => (
          <button
            className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted"
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            type="button"
          >
            {kindLabel[item.kind] ?? item.kind}
          </button>
        ))}
      </div>
      <EvidenceImageDialog
        onOpenChange={(open) => !open && setSelectedId(null)}
        verificationId={verificationId}
        evidenceId={selectedId}
      />
    </div>
  );
}

function EvidenceImageDialog({
  verificationId,
  evidenceId,
  onOpenChange,
}: {
  verificationId: string;
  evidenceId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [fetchImage, { data: imageUrl, isFetching }] = useLazyGetKycEvidenceImageQuery();
  const previousUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!evidenceId) return;
    void fetchImage({ verificationId, evidenceId });
  }, [evidenceId, fetchImage, verificationId]);

  useEffect(() => {
    if (previousUrlRef.current && previousUrlRef.current !== imageUrl) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
    previousUrlRef.current = imageUrl ?? null;
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, [imageUrl]);

  return (
    <Dialog open={evidenceId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title="Evidence image"
        description="Grayscale, watermarked copy for review -- the original color image is never shown here."
      >
        {isFetching && <p className="text-muted">Loading...</p>}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- this is a blob: object URL, not an optimizable remote asset
          <img alt="Redacted KYC evidence" className="w-full rounded-lg border border-line" src={imageUrl} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BotFindingsPanel({
  botFindings,
}: {
  botFindings: {
    plausibilityScore: number | null;
    flags: string[];
    summary: string | null;
    extractedFields: { fullName: string | null; dateOfBirth: string | null; documentNumber: string | null } | null;
  } | null;
}) {
  if (!botFindings) {
    return <p className="text-sm text-muted">No AI-assisted findings were recorded for this verification.</p>;
  }
  const { plausibilityScore, flags, summary, extractedFields } = botFindings;
  return (
    <div className="grid gap-2 text-sm">
      {summary && <p className="italic text-ink">&ldquo;{summary}&rdquo;</p>}
      {plausibilityScore !== null && (
        <p>
          <span className="font-bold">Plausibility score:</span> {plausibilityScore}/100
        </p>
      )}
      {flags.length > 0 && (
        <div>
          <p className="font-bold text-danger">Flags for review:</p>
          <ul className="list-disc pl-5">
            {flags.map((flag, index) => (
              <li key={index}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
      {extractedFields && (
        <div>
          <p className="font-bold">OCR read (unverified):</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">Full name</dt>
            <dd>{extractedFields.fullName ?? '--'}</dd>
            <dt className="text-muted">Date of birth</dt>
            <dd>{extractedFields.dateOfBirth ?? '--'}</dd>
            <dt className="text-muted">Document number</dt>
            <dd>{extractedFields.documentNumber ?? '--'}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
