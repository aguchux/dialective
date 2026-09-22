'use client';

import { useState } from 'react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetVdclReviewQuery,
  useRequestVdclSigningOtpMutation,
  useSignVdclVersionMutation,
} from '@/store/api';

const inputClass =
  'min-h-9 w-full max-w-xs rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

const PURPOSE_LABELS: Record<string, string> = {
  ASR_TRAINING: 'Speech recognition',
  TTS_TRAINING: 'Speech synthesis',
  LLM_TRAINING: 'Language model training',
  LINGUISTIC_RESEARCH: 'Academic research',
  DATASET_REDISTRIBUTION: 'Onward licensing',
  PUBLIC_PROMOTION: 'Demos and marketing',
  BIOMETRIC_PROCESSING: 'Speaker identification',
};

function formatDuration(ms: string | null | undefined): string {
  const value = Number(ms ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0m';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Review and sign.
 *
 * The contributor sees the exact dataset and the exact permissions before
 * signing, because the signature is bound to both: the step-up code is
 * issued against this manifest hash, and if the dataset changed since,
 * signing fails rather than binding them to something they never saw.
 */
export function VdclSignPanel({ versionId }: { versionId: string }) {
  const { data } = useGetVdclReviewQuery(versionId);
  const [requestOtp, otpState] = useRequestVdclSigningOtpMutation();
  const [sign, signState] = useSignVdclVersionMutation();

  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [typedName, setTypedName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  if (!data) return null;

  if (data.signedAt || signedAt) {
    return (
      <div className={`${cardClass} space-y-2`}>
        <h2 className="text-base font-bold text-ink">You have signed</h2>
        <p className="text-sm text-muted">
          Signed {new Date(data.signedAt ?? signedAt!).toLocaleString()}. Dialect Library
          countersigns after its compliance review — your licence grants nothing until it does.
        </p>
        {data.manifestHash ? (
          <p className="break-all text-xs text-muted">Manifest {data.manifestHash}</p>
        ) : null}
      </div>
    );
  }

  if (data.status !== 'PENDING_REVIEW' || !data.manifest) return null;

  async function handleRequestOtp() {
    setError(null);
    try {
      const result = await requestOtp(versionId).unwrap();
      setOtpRequestId(result.otpRequestId);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send your confirmation code.'));
    }
  }

  async function handleSign() {
    setError(null);
    if (!otpRequestId) return;
    try {
      const result = await sign({
        id: versionId,
        otpRequestId,
        code,
        signatureKind: 'typed',
        signatureLabel: typedName,
      }).unwrap();
      setSignedAt(result.signedAt);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not sign your licence.'));
    }
  }

  return (
    <div className={`${cardClass} space-y-4`}>
      <h2 className="text-base font-bold text-ink">Review and sign</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line px-3 py-2">
          <p className="text-xs uppercase text-muted">Recordings covered</p>
          <p className="text-lg font-bold text-ink">{data.manifest.recordingCount}</p>
        </div>
        <div className="rounded-lg border border-line px-3 py-2">
          <p className="text-xs uppercase text-muted">Audio</p>
          <p className="text-lg font-bold text-ink">
            {formatDuration(data.manifest.totalDurationMs)}
          </p>
        </div>
        <div className="rounded-lg border border-line px-3 py-2">
          <p className="text-xs uppercase text-muted">With transcripts</p>
          <p className="text-lg font-bold text-ink">
            {data.manifest.transcriptCount} / {data.manifest.recordingCount}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-ink">You are permitting:</p>
        <ul className="mt-1 grid gap-1">
          {data.purposes.map((p) => (
            <li key={p.purpose} className="text-sm text-muted">
              • {PURPOSE_LABELS[p.purpose] ?? p.purpose}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          Anything not listed here is not permitted. You can withdraw this licence at any time;
          withdrawal stops future use but cannot pull back a model already trained.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span className="text-sm text-ink">
          I confirm these are my recordings and I agree to license them on the terms above.
        </span>
      </label>

      {!otpRequestId ? (
        <ActionButton onClick={handleRequestOtp} disabled={!confirmed || otpState.isLoading}>
          {otpState.isLoading ? 'Sending code...' : 'Send me a confirmation code'}
        </ActionButton>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted">
            We emailed you a code. Enter it below along with your full name to sign.
          </p>
          <div>
            <label className="block text-sm font-bold text-ink" htmlFor="vdcl-name">
              Your full name
            </label>
            <input
              id="vdcl-name"
              className={inputClass}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-ink" htmlFor="vdcl-code">
              Confirmation code
            </label>
            <input
              id="vdcl-code"
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          <ActionButton
            onClick={handleSign}
            disabled={!code.trim() || !typedName.trim() || signState.isLoading}
          >
            {signState.isLoading ? 'Signing...' : 'Sign my licence'}
          </ActionButton>
        </div>
      )}
    </div>
  );
}
