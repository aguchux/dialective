'use client';

import Link from 'next/link';
import {
  AudioWaveform,
  BadgeCheck,
  CircleSlash,
  Clock,
  FileText,
  Mic,
  PauseCircle,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { useVerifyVdclLicenceQuery, type VdclPublicVerification } from '@/store/api';

const PURPOSE_LABELS: Record<string, string> = {
  ASR_TRAINING: 'Speech recognition',
  TTS_TRAINING: 'Speech synthesis',
  LLM_TRAINING: 'Language model training',
  LINGUISTIC_RESEARCH: 'Academic research',
  DATASET_REDISTRIBUTION: 'Onward licensing',
  PUBLIC_PROMOTION: 'Demos and marketing',
  BIOMETRIC_PROCESSING: 'Speaker identification',
};

type Outcome = VdclPublicVerification['outcome'];

/**
 * How each outcome is presented.
 *
 * The wording is chosen so a reader cannot mistake one state for another.
 * "Withdrawn" in particular must never read as a failure of the document --
 * the certificate was genuine, and the contributor has since exercised a
 * right they always had.
 */
const OUTCOMES: Record<
  Outcome,
  {
    title: string;
    detail: string;
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
    tone: 'good' | 'warn' | 'bad';
  }
> = {
  valid: {
    title: 'Valid licence',
    detail: 'This licence is signed by both parties and currently in force.',
    icon: BadgeCheck,
    tone: 'good',
  },
  suspended: {
    title: 'Suspended',
    detail:
      'This licence exists and was validly signed, but Dialect Library has suspended it pending review. The recordings it covers are not currently licensed for use.',
    icon: PauseCircle,
    tone: 'warn',
  },
  withdrawn: {
    title: 'Withdrawn by the contributor',
    detail:
      'This certificate was genuine, and the contributor has since withdrawn their licence. Withdrawal stops all future use of the recordings it covered.',
    icon: CircleSlash,
    tone: 'warn',
  },
  superseded: {
    title: 'Superseded by a later version',
    detail:
      'A newer version of this licence has replaced it. This document describes what was licensed at the time it was issued.',
    icon: Clock,
    tone: 'warn',
  },
  not_yet_active: {
    title: 'Not yet in force',
    detail:
      'This licence has not completed signing and countersignature, so it does not currently grant any rights.',
    icon: Clock,
    tone: 'warn',
  },
  hash_mismatch: {
    title: 'Could not be verified',
    detail:
      'This document does not match any licence on file. It may have been altered, or it may not be a genuine Dialect Library certificate.',
    icon: ShieldX,
    tone: 'bad',
  },
  unknown: {
    title: 'Could not be verified',
    detail:
      'This verification code is not recognised. Check that the whole code was scanned, or that the link was copied in full.',
    icon: ShieldX,
    tone: 'bad',
  },
};

/**
 * Tones are declared with explicit light/dark pairs rather than the
 * dashboard's theme tokens: this page is reached by scanning a printed QR,
 * so it renders outside the `dashboard-theme` scope where those tokens are
 * defined.
 */
const TONES = {
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  bad: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
};

function formatDuration(ms: string | null): string {
  const value = Number(ms ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.round((value % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Public licence verification.
 *
 * Reached by scanning the QR on a certificate, so the reader has no account
 * and may know nothing about the platform. The page answers one question --
 * is this document real and is the licence still in force -- and says
 * plainly what it does not answer.
 *
 * It deliberately does not identify the contributor. That restraint is
 * stated on the page rather than left implicit, so a subscriber checking
 * provenance understands it is by design and stops looking.
 */
export default function VerifyLicencePage({
  params,
}: {
  // Next 14: params is a plain object, not a Promise. Wrapping it in
  // `use()` throws "An unsupported type was passed to use()", which is a
  // 500 on the one page a stranger with no account has to be able to open.
  params: { token: string };
}) {
  const { token } = params;
  const { data, isLoading, isError } = useVerifyVdclLicenceQuery(token);

  const outcome = OUTCOMES[data?.outcome ?? 'unknown'];
  const OutcomeIcon = outcome.icon;
  const showDetail = data && data.outcome !== 'unknown' && data.outcome !== 'hash_mismatch';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 md:py-16">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-sm font-black text-[#6a18a8] dark:text-[#a866e0]"
        >
          Dialect Library
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-bold text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Licence verification
        </span>
      </div>

      {isLoading ? (
        <div className="grid min-h-40 place-items-center rounded-xl border border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Checking this licence...</p>
        </div>
      ) : isError ? (
        <div className={`rounded-xl border px-4 py-4 ${TONES.bad}`}>
          <p className="font-black">Could not check this licence right now</p>
          <p className="mt-1 text-sm">Please try again in a moment.</p>
        </div>
      ) : (
        <>
          <div className={`rounded-xl border px-5 py-5 ${TONES[outcome.tone]}`}>
            <div className="flex items-start gap-3">
              <OutcomeIcon className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xl font-black leading-tight">{outcome.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed">{outcome.detail}</p>
              </div>
            </div>
          </div>

          {showDetail ? (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Stat
                  icon={Mic}
                  label="Recordings"
                  value={String(data.recordingCount ?? '—')}
                />
                <Stat
                  icon={AudioWaveform}
                  label="Validated audio"
                  value={formatDuration(data.totalDurationMs)}
                />
                <Stat
                  icon={FileText}
                  label="With transcripts"
                  value={
                    data.transcriptCount !== null && data.recordingCount !== null
                      ? `${data.transcriptCount}/${data.recordingCount}`
                      : '—'
                  }
                />
              </div>

              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <Row label="Licence" value={`${data.licenceKey} (v${data.version})`} mono />
                <Row
                  label="Issued"
                  value={data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : '—'}
                />
                <Row label="Dialect" value={data.dialectTag ?? '—'} />
                <Row label="Country" value={data.country ?? '—'} />
                <Row label="Contributor" value={data.contributorLabel ?? '—'} />
              </dl>

              <div className="mt-6">
                <p className="text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Permitted uses
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {data.purposes.map((purpose) => (
                    <li
                      key={purpose}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200"
                    >
                      {PURPOSE_LABELS[purpose] ?? purpose}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-sm text-gray-500 dark:text-gray-400">
                  Any use not listed here is not permitted under this licence.
                </p>
              </div>
            </>
          ) : null}

          {/* Stated, not implicit. Someone checking provenance should
              understand the omission is by design and stop looking. */}
          <p className="mt-10 border-t border-gray-200 pt-5 text-sm leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Verification confirms a licence&apos;s status and the dataset it covers. It does not
            identify the contributor. Dialect Library contributors are never disclosed to the
            organisations that license their recordings, and the organisations are never disclosed
            to contributors.
          </p>
        </>
      )}
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-800">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3.5 py-2.5 dark:border-gray-800">
      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`mt-0.5 font-bold ${mono ? 'font-mono text-sm' : ''}`}>{value}</dd>
    </div>
  );
}
