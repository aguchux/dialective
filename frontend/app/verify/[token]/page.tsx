'use client';

import { use } from 'react';
import Link from 'next/link';
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

/**
 * How each outcome is presented.
 *
 * The wording is chosen so a reader cannot mistake one state for another.
 * "Withdrawn" in particular must never read as a failure of the document --
 * the certificate was genuine, and the contributor has since exercised a
 * right they always had.
 */
const OUTCOMES: Record<
  VdclPublicVerification['outcome'],
  { title: string; detail: string; tone: 'good' | 'warn' | 'bad' }
> = {
  valid: {
    title: 'Valid licence',
    detail: 'This licence is signed by both parties and currently in force.',
    tone: 'good',
  },
  suspended: {
    title: 'Suspended',
    detail:
      'This licence exists and was validly signed, but Dialect Library has suspended it pending review. The recordings it covers are not currently licensed for use.',
    tone: 'warn',
  },
  withdrawn: {
    title: 'Withdrawn by the contributor',
    detail:
      'This certificate was genuine, and the contributor has since withdrawn their licence. Withdrawal stops all future use of the recordings it covered.',
    tone: 'warn',
  },
  superseded: {
    title: 'Superseded by a later version',
    detail:
      'A newer version of this licence has replaced it. This document describes what was licensed at the time it was issued.',
    tone: 'warn',
  },
  not_yet_active: {
    title: 'Not yet in force',
    detail:
      'This licence has not completed signing and countersignature, so it does not currently grant any rights.',
    tone: 'warn',
  },
  hash_mismatch: {
    title: 'Could not be verified',
    detail:
      'This document does not match any licence on file. It may have been altered, or it may not be a genuine Dialect Library certificate.',
    tone: 'bad',
  },
  unknown: {
    title: 'Could not be verified',
    detail:
      'This verification code is not recognised. Check that the whole code was scanned, or that the link was copied in full.',
    tone: 'bad',
  },
};

const TONES = {
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
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
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, isLoading, isError } = useVerifyVdclLicenceQuery(token);

  const outcome = OUTCOMES[data?.outcome ?? 'unknown'];
  const showDetail = data && data.outcome !== 'unknown' && data.outcome !== 'hash_mismatch';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm font-bold text-[#6a18a8]">
          Dialect Library
        </Link>
        <h1 className="mt-2 text-2xl font-black">Licence verification</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-600">Checking this licence...</p>
      ) : isError ? (
        <div className={`rounded-lg border px-4 py-3 ${TONES.bad}`}>
          <p className="font-bold">Could not check this licence right now</p>
          <p className="text-sm">Please try again in a moment.</p>
        </div>
      ) : (
        <>
          <div className={`rounded-lg border px-4 py-3 ${TONES[outcome.tone]}`}>
            <p className="font-bold">{outcome.title}</p>
            <p className="mt-1 text-sm">{outcome.detail}</p>
          </div>

          {showDetail ? (
            <>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                <Row label="Licence" value={`${data.licenceKey} (v${data.version})`} />
                <Row
                  label="Issued"
                  value={data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : '—'}
                />
                <Row label="Dialect" value={data.dialectTag ?? '—'} />
                <Row label="Country" value={data.country ?? '—'} />
                <Row label="Contributor" value={data.contributorLabel ?? '—'} />
                <Row label="Recordings covered" value={String(data.recordingCount ?? '—')} />
                <Row label="Validated audio" value={formatDuration(data.totalDurationMs)} />
                <Row
                  label="With transcripts"
                  value={
                    data.transcriptCount !== null && data.recordingCount !== null
                      ? `${data.transcriptCount} of ${data.recordingCount}`
                      : '—'
                  }
                />
              </dl>

              <div className="mt-6">
                <p className="text-sm font-bold">Permitted uses</p>
                <ul className="mt-2 grid gap-1">
                  {data.purposes.map((purpose) => (
                    <li key={purpose} className="text-sm text-gray-700">
                      • {PURPOSE_LABELS[purpose] ?? purpose}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-gray-600">
                  Any use not listed here is not permitted under this licence.
                </p>
              </div>
            </>
          ) : null}

          {/* Stated, not implicit. Someone checking provenance should
              understand the omission is by design and stop looking. */}
          <p className="mt-8 border-t pt-4 text-sm text-gray-600">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <dt className="text-xs uppercase text-gray-500">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}
