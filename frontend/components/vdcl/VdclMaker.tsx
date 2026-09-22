'use client';

import { useState } from 'react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConsentCards, CONSENT_WORDING_VERSION } from '@/components/vdcl/ConsentCards';
import { VdclSignPanel } from '@/components/vdcl/VdclSignPanel';
import { VdclTracker } from '@/components/vdcl/VdclTracker';
import {
  normalizeErrorMessage,
  useGetMyVdclVersionsQuery,
  useGetVdclReadinessQuery,
  useStartVdclDraftMutation,
  type VdclPurpose,
} from '@/store/api';

function formatDuration(ms: string | null | undefined): string {
  const value = Number(ms ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0m';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const EXCLUSION_LABELS: Record<string, string> = {
  not_yet_scored: 'Still being scored — these will be picked up later',
  audio_purged: 'Audio was deleted under the retention policy',
  rejected_by_quality_gate: 'Rejected at recording for length, silence or unclear audio',
  expired_unscored: 'Timed out before scoring',
  misplaced_dialect: 'Flagged as a different dialect',
  no_audio_flagged: 'Reported as having no audible content',
};

/**
 * The VDCL Maker.
 *
 * A contributor's route from "I record for Dialect Library" to "I have
 * licensed my recordings, on terms I chose". The order is deliberate and
 * matches the plan: readiness first, so nobody enters a flow they cannot
 * finish; then the permissions, each chosen separately; then the exact
 * dataset; then the signature.
 */
export function VdclMaker() {
  const readiness = useGetVdclReadinessQuery();
  const versions = useGetMyVdclVersionsQuery();
  const [startDraft, startState] = useStartVdclDraftMutation();

  const [purposes, setPurposes] = useState<VdclPurpose[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openVersion = versions.data?.find((v) =>
    ['DRAFT', 'PENDING_COMPILATION', 'PENDING_REVIEW', 'PENDING_COUNTERSIGNATURE'].includes(
      v.status,
    ),
  );
  const activeLicence = versions.data?.find((v) => v.status === 'ACTIVE');
  const current = activeVersionId ?? openVersion?.versionId ?? null;

  async function handleStart() {
    setError(null);
    try {
      const result = await startDraft({
        purposes,
        wordingVersion: CONSENT_WORDING_VERSION,
        locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
      }).unwrap();
      setActiveVersionId(result.versionId);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not start your licence.'));
    }
  }

  return (
    <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Your Voice Dataset Contributor Licence</h1>
          <p className="leading-relaxed text-muted">
            A VDCL is your permission for Dialect Library to license your recordings to the
            organisations that train speech models. You choose what it may be used for, and you can
            withdraw it at any time — though withdrawal stops future use, it cannot pull back a
            model already trained.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>
        ) : null}

        {readiness.isLoading ? <p className="text-sm text-muted">Checking your account...</p> : null}

        {/* Readiness first: nobody should reach a signature screen they are
            not entitled to complete. */}
        {readiness.data && !readiness.data.ready ? (
          <div className={`${cardClass} space-y-3`}>
            <h2 className="text-base font-bold text-ink">Before you can sign</h2>
            <ul className="space-y-2">
              {readiness.data.blockers.map((blocker) => (
                <li key={blocker.requirement} className="rounded-lg border border-line px-3 py-2">
                  <p className="text-sm font-bold text-ink">{blocker.requirement}</p>
                  <p className="text-sm text-muted">{blocker.detail}</p>
                  {!blocker.actionable ? (
                    <p className="mt-1 text-xs text-muted">
                      This one is with Dialect Library — nothing for you to do right now.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {readiness.data?.inventory ? (
          <div className={`${cardClass} space-y-3`}>
            <h2 className="text-base font-bold text-ink">What a licence would cover today</h2>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line px-3 py-2">
                <dt className="text-xs uppercase text-muted">Recordings</dt>
                <dd className="text-lg font-bold text-ink">
                  {readiness.data.inventory.eligibleCount}
                </dd>
              </div>
              <div className="rounded-lg border border-line px-3 py-2">
                <dt className="text-xs uppercase text-muted">Audio</dt>
                <dd className="text-lg font-bold text-ink">
                  {formatDuration(readiness.data.inventory.totalDurationMs)}
                </dd>
              </div>
              <div className="rounded-lg border border-line px-3 py-2">
                <dt className="text-xs uppercase text-muted">Average quality</dt>
                <dd className="text-lg font-bold text-ink">
                  {readiness.data.inventory.meanCompositeScore ?? '--'}
                </dd>
              </div>
            </dl>
            {Object.keys(readiness.data.inventory.exclusionsByReason).length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm font-bold text-ink">
                  {readiness.data.inventory.excludedCount} recording(s) would not be included
                </summary>
                <ul className="mt-2 space-y-1">
                  {Object.entries(readiness.data.inventory.exclusionsByReason).map(
                    ([reason, count]) => (
                      <li key={reason} className="text-sm text-muted">
                        <span className="font-bold text-ink">{count}</span>{' '}
                        {EXCLUSION_LABELS[reason] ?? reason}
                      </li>
                    ),
                  )}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        {activeLicence ? (
          <div className={`${cardClass} space-y-2`}>
            <h2 className="text-base font-bold text-ink">Your licence is active</h2>
            <p className="text-sm text-muted">
              {activeLicence.licenceKey} covers {activeLicence.recordingCount ?? 0} recordings.
            </p>
          </div>
        ) : null}

        {/* Permissions before the signature, each one a separate choice --
            never a single "accept everything" box. */}
        {readiness.data?.ready && !openVersion && !activeLicence ? (
          <div className={`${cardClass} space-y-4`}>
            <div>
              <h2 className="text-base font-bold text-ink">What may your recordings be used for?</h2>
              <p className="text-sm text-muted">
                Pick each use you are willing to allow. Anything you leave unticked is not
                permitted, and you can withdraw the whole licence later.
              </p>
            </div>
            <ConsentCards selected={purposes} onChange={setPurposes} />
            <ActionButton
              onClick={handleStart}
              disabled={purposes.length === 0 || startState.isLoading}
            >
              {startState.isLoading ? 'Preparing your licence...' : 'Prepare my licence'}
            </ActionButton>
            {purposes.length === 0 ? (
              <p className="text-xs text-muted">Choose at least one use to continue.</p>
            ) : null}
          </div>
        ) : null}

        {current ? (
          <>
            <VdclTracker versionId={current} />
            <VdclSignPanel versionId={current} />
          </>
        ) : null}

        {versions.data && versions.data.length > 0 ? (
          <div className={`${cardClass} space-y-2`}>
            <h2 className="text-base font-bold text-ink">Your licence history</h2>
            <ul className="space-y-1">
              {versions.data.map((v) => (
                <li key={v.versionId} className="flex flex-wrap justify-between gap-2 text-sm">
                  <button
                    type="button"
                    className="font-bold text-ink underline"
                    onClick={() => setActiveVersionId(v.versionId)}
                  >
                    {v.licenceKey} v{v.version}
                  </button>
                  <span className="text-muted">{v.status.replace(/_/g, ' ').toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
    </div>
  );
}
