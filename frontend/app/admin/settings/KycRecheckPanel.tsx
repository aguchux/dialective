'use client';
import { useState } from 'react';
import { dialectivaApi, normalizeErrorMessage } from '@/store/api';
interface Result {
  enabled: boolean;
  scanned: number;
  eligible: number;
  approved: number;
  skipped: number;
  errors: number;
  nextCursor: string | null;
}
interface RecheckRun {
  id: string;
  trigger: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
  finishedAt: string | null;
  enabled: boolean;
  scanned: number;
  eligible: number;
  approved: number;
  skipped: number;
  errors: number;
  nextCursor: string | null;
  errorMessage: string | null;
}
const recheckApi = dialectivaApi.injectEndpoints({
  endpoints: (builder) => ({
    previewKycRecheck: builder.mutation<Result, void>({
      query: () => ({ url: '/admin/kyc/recheck/preview', method: 'GET' }),
    }),
    runKycRecheck: builder.mutation<Result, void>({
      query: () => ({ url: '/admin/kyc/recheck/run', method: 'POST' }),
      invalidatesTags: ['Kyc'],
    }),
    listKycRecheckRuns: builder.query<RecheckRun[], void>({
      query: () => '/admin/kyc/recheck/runs',
      providesTags: ['Kyc'],
    }),
  }),
});
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}
export function KycRecheckPanel() {
  const [preview, previewState] = recheckApi.usePreviewKycRecheckMutation();
  const [run, runState] = recheckApi.useRunKycRecheckMutation();
  const {
    data: runs,
    isLoading: runsLoading,
    refetch: refetchRuns,
  } = recheckApi.useListKycRecheckRunsQuery(undefined, { pollingInterval: 60_000 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const busy = previewState.isLoading || runState.isLoading;
  async function check(apply: boolean) {
    setError('');
    try {
      setResult(await (apply ? run() : preview()).unwrap());
      if (apply) void refetchRuns();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to recheck verifications.'));
    }
  }
  const mostRecentScheduled = runs?.find((r) => r.trigger === 'SCHEDULED');
  const cronLooksStale =
    !runsLoading &&
    (!mostRecentScheduled ||
      Date.now() - new Date(mostRecentScheduled.startedAt).getTime() > 15 * 60_000);
  return (
    <div className="grid gap-3 border-t border-line pt-4">
      <h3 className="font-bold">DLKYC pending reviews</h3>
      <p className="text-sm text-muted">
        Auto-approval rechecks pending reviews every five minutes using saved thresholds, in batches
        of up to 100.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => check(false)}
          className="rounded-lg border border-line px-3 py-2 disabled:opacity-50"
        >
          Preview eligibility
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => check(true)}
          className="rounded-lg bg-accent px-3 py-2 text-white disabled:opacity-50"
        >
          Recheck eligible verifications
        </button>
      </div>
      {result && (
        <p role="status" className="text-sm">
          {result.enabled
            ? `${result.scanned} checked; ${result.eligible} eligible; ${result.approved} approved; ${result.skipped} skipped; ${result.errors} deferred.${result.nextCursor ? ' More reviews remain for scheduled processing.' : ''}`
            : 'Save and enable DLKYC auto-approval before rechecking.'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold">Recent runs</h4>
          {!runsLoading && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                cronLooksStale ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {cronLooksStale
                ? 'Scheduled job hasn’t run in the last 15 min'
                : 'Scheduled job is running'}
            </span>
          )}
        </div>
        {runsLoading && <p className="text-sm text-muted">Loading run history...</p>}
        {!runsLoading && (!runs || runs.length === 0) && (
          <p className="text-sm text-muted">
            No recheck runs recorded yet -- the scheduled job fires every 5 minutes once DLKYC
            auto-approval is enabled.
          </p>
        )}
        {!runsLoading && runs && runs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-150 border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr className="border-b border-line last:border-0" key={r.id}>
                    <td className="px-3 py-2 align-top">{formatRelativeTime(r.startedAt)}</td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          r.trigger === 'SCHEDULED'
                            ? 'bg-surface-muted text-ink'
                            : 'bg-accent-soft text-accent'
                        }`}
                      >
                        {r.trigger === 'SCHEDULED' ? 'Scheduled' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {r.errorMessage ? (
                        <span className="text-danger">Failed: {r.errorMessage}</span>
                      ) : !r.enabled ? (
                        <span className="text-muted">Ran, auto-approval was off</span>
                      ) : (
                        <span>
                          {r.scanned} scanned &middot; {r.eligible} eligible &middot; {r.approved}{' '}
                          approved
                          {r.errors > 0 ? ` · ${r.errors} deferred` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
