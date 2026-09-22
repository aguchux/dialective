'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass } from '@/components/dashboard/shared';
import { alertTone, primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';
import { VdclAgreementsPanel } from './VdclAgreementsPanel';
import {
  normalizeErrorMessage,
  useCompileVdclVersionMutation,
  useGetVdclExclusionsQuery,
  useGetVdclManifestQuery,
  useVerifyVdclManifestHashQuery,
} from '@/store/api';

const inputClass =
  'min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:bg-surface-muted';

function formatDuration(ms: string | number | null | undefined): string {
  const value = Number(ms ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '--';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * The VDCL manifest inspector.
 *
 * Phase 2's acceptance criterion is that an admin can explain every included
 * and excluded recording. This page is where that happens: the manifest's
 * contents and metrics on one side, the reasons for every exclusion on the
 * other, and a hash check that proves the manifest has not been altered
 * since it was issued.
 */
export default function AdminVdclPage() {
  const [versionId, setVersionId] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const manifest = useGetVdclManifestQuery({ id: active, page }, { skip: !active });
  const exclusions = useGetVdclExclusionsQuery(active, { skip: !active });
  const hashCheck = useVerifyVdclManifestHashQuery(active, {
    skip: !active || !manifest.data?.manifest,
  });
  const [compile, compileState] = useCompileVdclVersionMutation();

  async function handleCompile() {
    setError(null);
    setNotice(null);
    try {
      const result = await compile(active).unwrap();
      setNotice(
        `Compiled ${result.recordingCount} recordings (${result.excludedCount} excluded). Manifest ${result.manifestKey}.`,
      );
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not compile this version.'));
    }
  }

  const data = manifest.data;
  const job = data?.compilationJob;

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">VDCL licences</h1>
          <p className="leading-relaxed text-muted">
            Countersign, suspend and inspect contributor licences. A manifest is frozen at
            compilation — recordings made afterwards are picked up by a new version, never added
            to this one.
          </p>
        </div>

        <VdclAgreementsPanel />

        <div className="grid gap-2">
          <h2 className="text-xl font-black">Manifest inspector</h2>
          <p className="text-sm leading-relaxed text-muted">
            Paste a version id to see exactly what its licence covers and why every other
            recording was left out.
          </p>
        </div>

      <div className={`${cardClass} space-y-3 p-5`}>
        <label className="block text-sm font-bold text-ink" htmlFor="vdcl-version-id">
          VDCL version ID
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="vdcl-version-id"
            className={`${inputClass} max-w-md`}
            placeholder="Paste a VDCL version id"
            value={versionId}
            onChange={(event) => setVersionId(event.target.value)}
          />
          <ActionButton
            onClick={() => {
              setPage(0);
              setError(null);
              setNotice(null);
              setActive(versionId.trim());
            }}
            disabled={!versionId.trim()}
            className={primaryButton}
          >
            Inspect
          </ActionButton>
        </div>
      </div>

      {error ? (
        <p className={`rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.danger}`}>{error}</p>
      ) : null}
      {notice ? (
        <p className={`rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.success}`}>
          {notice}
        </p>
      ) : null}

      {active && manifest.isLoading ? <p className="text-sm text-muted">Loading...</p> : null}

      {data && !data.manifest ? (
        <div className={`${cardClass} space-y-3 p-5`}>
          <p className="text-sm text-muted">{data.message}</p>
          <p className="text-sm text-muted">
            Status: <span className="font-bold text-ink">{data.status}</span>
          </p>
          {job?.blockerMessage ? (
            <p className={`rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.warning}`}>
              {job.blockerMessage}
              {job.failureReason ? ` (${job.failureReason})` : ''}
            </p>
          ) : null}
          {data.status === 'DRAFT' || data.status === 'PENDING_COMPILATION' ? (
            <ActionButton
              onClick={handleCompile}
              disabled={compileState.isLoading}
              pending={compileState.isLoading}
              pendingLabel="Compiling..."
              className={primaryButton}
            >
              Compile now
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {data?.manifest ? (
        <>
          <div className={`${cardClass} space-y-3 p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-ink">{data.manifest.manifestKey}</h2>
              <span className="text-sm text-muted">{data.status}</span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Recordings covered"
                value={String(data.manifest.recordingCount)}
                definition={data.manifest.scoreDefinitions?.recordingCount}
              />
              <Metric
                label="Validated duration"
                value={formatDuration(data.manifest.totalDurationMs)}
                definition={data.manifest.scoreDefinitions?.totalDurationMs}
              />
              <Metric
                label="Transcript coverage"
                value={`${data.manifest.transcriptCount} / ${data.manifest.recordingCount}`}
                definition={data.manifest.scoreDefinitions?.transcriptCount}
              />
              <Metric
                label="Mean quality score"
                value={data.manifest.meanCompositeScore ?? '--'}
                definition={data.manifest.scoreDefinitions?.meanCompositeScore}
              />
            </dl>
            <p className="text-xs text-muted">
              Licence {data.licenceKey} &middot; {data.dialectTag}
              {data.country ? ` (${data.country.name})` : ''} &middot; ASR pipeline{' '}
              {data.manifest.asrPipelineVersion ?? 'n/a'}
            </p>
            <p className="text-xs text-muted">
              Purposes granted: {data.purposes?.join(', ') || 'none'}
            </p>
          </div>

          {/* A manifest hash is only worth printing on a document if someone
              checks it. A mismatch means the rows were altered after the
              licence was issued. */}
          {hashCheck.data ? (
            <div
              className={`${cardClass} ${
                hashCheck.data.matches ? 'border-accent/30 bg-accent-soft' : 'border-danger/40 bg-danger/10'
              }`}
            >
              <p className="text-sm font-bold text-ink">
                {hashCheck.data.matches
                  ? 'Manifest hash verified'
                  : 'Manifest hash does NOT match'}
              </p>
              <p className="break-all text-xs text-muted">
                stored {hashCheck.data.storedHash ?? 'none'}
              </p>
              {!hashCheck.data.matches ? (
                <p className="break-all text-xs text-danger">
                  recomputed {hashCheck.data.recomputedHash} — this manifest was changed after it
                  was compiled.
                </p>
              ) : null}
            </div>
          ) : null}

          {data.anomalies?.length ? (
            <div className={`${cardClass} border-warning/40 bg-warning/10 p-4`}>
              {data.anomalies.map((anomaly) => (
                <p key={anomaly.kind} className="text-sm font-bold text-warning">
                  {anomaly.count} affected: {anomaly.detail}
                </p>
              ))}
            </div>
          ) : null}

          {exclusions.data ? (
            <div className={`${cardClass} space-y-3 p-5`}>
              <h2 className="text-base font-bold text-ink">Why recordings were left out</h2>
              <p className="text-xs text-muted">
                Recomputed {new Date(exclusions.data.recomputedAt).toLocaleString()} against the
                contributor&apos;s inventory as it stands today, not as it stood at compilation.
              </p>
              {exclusions.data.exclusions.length === 0 ? (
                <p className="text-sm text-muted">
                  Nothing was excluded — every eligible recording is covered.
                </p>
              ) : (
                <ul className="space-y-2">
                  {exclusions.data.exclusions.map((exclusion) => (
                    <li
                      key={exclusion.reason}
                      className="rounded-lg border border-line px-3 py-2"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-ink">{exclusion.count}</span>
                        <span
                          className={`text-xs font-bold ${
                            exclusion.transient ? 'text-warning' : 'text-muted'
                          }`}
                        >
                          {exclusion.transient ? 'resolves on its own' : 'permanent'}
                        </span>
                      </div>
                      <p className="text-sm text-ink">{exclusion.label}</p>
                    </li>
                  ))}
                </ul>
              )}
              {exclusions.data.eligibleButNotInManifest > 0 ? (
                <p className="text-sm text-muted">
                  {exclusions.data.eligibleButNotInManifest} eligible recording(s) are not in this
                  manifest — recorded after it was frozen. A new version would pick them up.
                </p>
              ) : null}
              {exclusions.data.coveredNoLongerEligible > 0 ? (
                <p className="text-sm text-muted">
                  {exclusions.data.coveredNoLongerEligible} covered recording(s) would not pass
                  eligibility today. The signed licence still covers them.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={`${cardClass} space-y-3 p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-ink">Covered recordings</h2>
              <span className="text-sm text-muted">
                {(data.page ?? 0) * (data.pageSize ?? 0) + 1}–
                {Math.min(
                  ((data.page ?? 0) + 1) * (data.pageSize ?? 0),
                  data.totalItems ?? 0,
                )}{' '}
                of {data.totalItems ?? 0}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted">
                    <th className="py-2 pr-3">Recording</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Composite</th>
                    <th className="py-2 pr-3">Transcript</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items?.map((item) => (
                    <tr key={item.id} className="border-t border-line">
                      <td className="py-2 pr-3 font-mono text-xs">{item.recordingId}</td>
                      <td className="py-2 pr-3">{formatDuration(item.durationMs)}</td>
                      <td className="py-2 pr-3">{item.score ?? '--'}</td>
                      <td className="py-2 pr-3">{item.compositeScore ?? '--'}</td>
                      <td className="py-2 pr-3">{item.hasTranscript ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <ActionButton
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className={secondaryButton}
              >
                Previous
              </ActionButton>
              <ActionButton
                onClick={() => setPage((p) => p + 1)}
                disabled={
                  ((data.page ?? 0) + 1) * (data.pageSize ?? 0) >= (data.totalItems ?? 0)
                }
                className={secondaryButton}
              >
                Next
              </ActionButton>
            </div>
          </div>
        </>
      ) : null}
      </div>
    </AdminShell>
  );
}

/**
 * A metric shown with its definition inline. The plan is explicit that a
 * score presented without one is not information -- and the person deciding
 * whether to license their voice is the least likely to have that context.
 */
function Metric({
  label,
  value,
  definition,
}: {
  label: string;
  value: string;
  definition?: string;
}) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <dt className="text-xs uppercase text-muted">{label}</dt>
      <dd className="text-lg font-bold text-ink">{value}</dd>
      {definition ? <p className="mt-1 text-xs text-muted">{definition}</p> : null}
    </div>
  );
}
