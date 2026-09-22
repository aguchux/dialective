'use client';

import { cardClass } from '@/components/dashboard/shared';
import { useGetVdclVersionStatusQuery } from '@/store/api';

/**
 * The compilation tracker.
 *
 * The plan's requirement is that a contributor never sees an unexplained
 * pending state, so this never renders a bare spinner. Every state names
 * the stage, says whose move it is, and what happens next.
 *
 * "Waiting on you" versus "waiting on us" is the distinction that actually
 * matters: someone who thinks Dialect Library is working on something that
 * is really waiting on their signature will wait forever.
 */
export function VdclTracker({ versionId }: { versionId: string }) {
  const { data, isLoading } = useGetVdclVersionStatusQuery(versionId, {
    // Compilation is quick at current volumes, but a contributor who opened
    // this page mid-run should see it finish without a manual refresh.
    pollingInterval: 15_000,
  });

  if (isLoading || !data) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-muted">Loading your licence status...</p>
      </div>
    );
  }

  return (
    <div className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Progress</h2>
        <span className="text-sm text-muted">{data.progressPercent}%</span>
      </div>

      {data.nextAction ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm font-bold ${
            data.waitingOn === 'you'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-surface-muted text-ink'
          }`}
        >
          {data.waitingOn === 'you' ? 'Your turn: ' : ''}
          {data.nextAction}
        </p>
      ) : null}

      {data.blockerMessage ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          {data.blockerMessage}
        </p>
      ) : null}

      <ol className="grid gap-1">
        {data.stages.map((stage) => (
          <li key={stage.stage} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`inline-block size-2 rounded-full ${
                stage.state === 'done'
                  ? 'bg-emerald-500'
                  : stage.state === 'current'
                    ? 'bg-ink'
                    : stage.state === 'failed'
                      ? 'bg-red-500'
                      : 'bg-line'
              }`}
            />
            <span
              className={
                stage.state === 'pending'
                  ? 'text-muted'
                  : stage.state === 'failed'
                    ? 'font-bold text-red-700'
                    : 'font-bold text-ink'
              }
            >
              {stage.label}
            </span>
            {stage.state === 'current' ? (
              <span className="text-xs text-muted">in progress</span>
            ) : null}
          </li>
        ))}
      </ol>

      {data.estimatedCompletionAt ? (
        <p className="text-xs text-muted">
          Estimated completion {new Date(data.estimatedCompletionAt).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  );
}
