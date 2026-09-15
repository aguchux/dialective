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
const recheckApi = dialectivaApi.injectEndpoints({
  endpoints: (builder) => ({
    previewKycRecheck: builder.mutation<Result, void>({
      query: () => ({ url: '/admin/kyc/recheck/preview', method: 'GET' }),
    }),
    runKycRecheck: builder.mutation<Result, void>({
      query: () => ({ url: '/admin/kyc/recheck/run', method: 'POST' }),
    }),
  }),
});
export function KycRecheckPanel() {
  const [preview, previewState] = recheckApi.usePreviewKycRecheckMutation();
  const [run, runState] = recheckApi.useRunKycRecheckMutation();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const busy = previewState.isLoading || runState.isLoading;
  async function check(apply: boolean) {
    setError('');
    try {
      setResult(await (apply ? run() : preview()).unwrap());
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to recheck verifications.'));
    }
  }
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
    </div>
  );
}
