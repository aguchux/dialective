'use client';

import { AlertTriangle, Check, Loader2, UserRoundCheck } from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { alertTone } from '@/components/vdcl/vdcl-ui';
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
 * is really waiting on their signature will wait forever. So that answer is
 * the most prominent thing on the card -- above the stage list, not
 * inferred from it.
 */
export function VdclTracker({ versionId }: { versionId: string }) {
  const { data, isLoading } = useGetVdclVersionStatusQuery(versionId, {
    // Compilation is quick at current volumes, but a contributor who opened
    // this page mid-run should see it finish without a manual refresh.
    pollingInterval: 15_000,
  });

  if (isLoading || !data) {
    return (
      <div className={`${cardClass} grid place-items-center p-8`}>
        <p className="text-sm text-muted">Loading your licence status...</p>
      </div>
    );
  }

  const yourMove = data.waitingOn === 'you';

  return (
    <section className={`${cardClass} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-black text-ink">Progress</h2>
        <span className="text-sm font-bold tabular-nums text-muted">
          {data.progressPercent}% complete
        </span>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={data.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${data.progressPercent}%` }}
        />
      </div>

      {/* Whose move it is, stated before the stage list rather than left to
          be inferred from which dot is filled. */}
      {data.nextAction ? (
        <p
          className={`mt-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm font-bold ${
            yourMove ? alertTone.success : alertTone.neutral
          }`}
        >
          {yourMove ? (
            <UserRoundCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Loader2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {yourMove ? <span className="block">Your turn</span> : null}
            <span className={yourMove ? 'font-medium' : ''}>{data.nextAction}</span>
          </span>
        </p>
      ) : null}

      {data.blockerMessage ? (
        <p
          className={`mt-2.5 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.warning}`}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {data.blockerMessage}
        </p>
      ) : null}

      <ol className="mt-5 grid gap-0">
        {data.stages.map((stage, index) => {
          const last = index === data.stages.length - 1;
          return (
            <li key={stage.stage} className="grid grid-cols-[auto_1fr] gap-x-3">
              <div className="grid justify-items-center">
                <span
                  aria-hidden="true"
                  className={`grid size-6 place-items-center rounded-full border-2 ${
                    stage.state === 'done'
                      ? 'border-accent bg-accent text-white'
                      : stage.state === 'current'
                        ? 'border-accent bg-surface text-accent'
                        : stage.state === 'failed'
                          ? 'border-danger bg-danger text-white'
                          : 'border-line bg-surface'
                  }`}
                >
                  {stage.state === 'done' ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : stage.state === 'failed' ? (
                    <AlertTriangle className="size-3" />
                  ) : stage.state === 'current' ? (
                    <span className="size-2 rounded-full bg-accent" />
                  ) : null}
                </span>
                {/* The connector is what turns eight dots into one pipeline. */}
                {!last ? (
                  <span
                    aria-hidden="true"
                    className={`h-full min-h-5 w-0.5 ${
                      stage.state === 'done' ? 'bg-accent' : 'bg-line'
                    }`}
                  />
                ) : null}
              </div>
              <div className={last ? 'pb-0' : 'pb-4'}>
                <p
                  className={`text-sm leading-6 ${
                    stage.state === 'pending'
                      ? 'text-muted'
                      : stage.state === 'failed'
                        ? 'font-bold text-danger'
                        : 'font-bold text-ink'
                  }`}
                >
                  {stage.label}
                </p>
                {stage.state === 'current' ? (
                  <p className="text-xs font-bold text-accent">In progress</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {data.estimatedCompletionAt ? (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Estimated completion {new Date(data.estimatedCompletionAt).toLocaleDateString()}
        </p>
      ) : null}
    </section>
  );
}
