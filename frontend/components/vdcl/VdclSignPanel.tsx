'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AudioWaveform,
  BadgeCheck,
  Check,
  FileText,
  KeyRound,
  Mic,
  PenLine,
} from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { alertTone, fieldClass, primaryButton } from '@/components/vdcl/vdcl-ui';
import {
  normalizeErrorMessage,
  useGetVdclReviewQuery,
  useRequestVdclSigningOtpMutation,
  useSignVdclVersionMutation,
} from '@/store/api';

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
  const seconds = Math.floor((value % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Review and sign.
 *
 * The contributor sees the exact dataset and the exact permissions before
 * signing, because the signature is bound to both: the step-up code is
 * issued against this manifest hash, and if the dataset changed since,
 * signing fails rather than binding them to something they never saw.
 *
 * The visual weight is deliberate. This is the one screen where someone
 * takes on a legal commitment, so it is framed in the accent rather than
 * rendered as another neutral card in a stack -- the page should not let
 * anyone sign while thinking they are still browsing.
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
      <section className="rounded-xl border border-accent/30 bg-accent-soft p-5">
        <h2 className="flex items-center gap-2 text-lg font-black text-accent">
          <BadgeCheck className="size-5" aria-hidden="true" />
          You have signed
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Signed {new Date(data.signedAt ?? signedAt!).toLocaleString()}. Dialect Library
          countersigns after its compliance review — your licence grants nothing until it does.
        </p>
        {data.manifestHash ? (
          <p className="mt-3 break-all rounded-lg bg-surface/60 px-3 py-2 font-mono text-xs text-muted">
            Manifest {data.manifestHash}
          </p>
        ) : null}
      </section>
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
    <section className={`${cardClass} overflow-hidden border-accent/30`}>
      <div className="border-b border-accent/20 bg-accent-soft px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-black text-accent">
          <PenLine className="size-5" aria-hidden="true" />
          Review and sign
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          This is what your signature will cover. Check it before you continue.
        </p>
      </div>

      <div className="grid gap-5 p-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Metric
            icon={Mic}
            label="Recordings covered"
            value={String(data.manifest.recordingCount)}
          />
          <Metric
            icon={AudioWaveform}
            label="Audio"
            value={formatDuration(data.manifest.totalDurationMs)}
          />
          <Metric
            icon={FileText}
            label="With transcripts"
            value={`${data.manifest.transcriptCount}/${data.manifest.recordingCount}`}
          />
        </dl>

        <div>
          <p className="text-sm font-black uppercase tracking-wide text-muted">
            You are permitting
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.purposes.map((p) => (
              <li
                key={p.purpose}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-sm font-bold text-accent"
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                {PURPOSE_LABELS[p.purpose] ?? p.purpose}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            Anything not listed here is not permitted. You can withdraw this licence at any time;
            withdrawal stops future use but cannot pull back a model already trained.
          </p>
        </div>

        {error ? (
          <p
            className={`flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.danger}`}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
            confirmed ? 'border-accent bg-accent-soft' : 'border-line'
          }`}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span
            aria-hidden="true"
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${
              confirmed ? 'border-accent bg-accent text-white' : 'border-line bg-surface'
            }`}
          >
            {confirmed ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
          <span className={`text-sm leading-relaxed ${confirmed ? 'text-accent' : 'text-ink'}`}>
            I confirm these are my recordings and I agree to license them on the terms above.
          </span>
        </label>

        {!otpRequestId ? (
          <div>
            <ActionButton
              onClick={handleRequestOtp}
              disabled={!confirmed || otpState.isLoading}
              pending={otpState.isLoading}
              pendingLabel="Sending code..."
              className={primaryButton}
            >
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4" aria-hidden="true" />
                Send me a confirmation code
              </span>
            </ActionButton>
            {!confirmed ? (
              <p className="mt-2 text-sm text-muted">Tick the box above to continue.</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 rounded-lg border border-line bg-surface-muted p-4">
            <p className="text-sm leading-relaxed text-muted">
              We emailed you a code. Enter it below along with your full name to sign.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-sm font-bold text-ink" htmlFor="vdcl-name">
                  Your full name
                </label>
                <input
                  id="vdcl-name"
                  className={fieldClass}
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  autoComplete="name"
                  placeholder="As it should appear on the licence"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-bold text-ink" htmlFor="vdcl-code">
                  Confirmation code
                </label>
                <input
                  id="vdcl-code"
                  className={`${fieldClass} font-mono tracking-[0.3em]`}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </div>
            </div>
            <ActionButton
              onClick={handleSign}
              disabled={!code.trim() || !typedName.trim() || signState.isLoading}
              pending={signState.isLoading}
              pendingLabel="Signing..."
              className={`${primaryButton} justify-self-start`}
            >
              <span className="inline-flex items-center gap-2">
                <PenLine className="size-4" aria-hidden="true" />
                Sign my licence
              </span>
            </ActionButton>
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-3.5">
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1.5 text-2xl font-black tabular-nums text-ink">{value}</dd>
    </div>
  );
}
