'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Headphones, RefreshCw } from 'lucide-react';
import { cardClass, EmptyPanel } from '@/components/dashboard/shared';
import {
  formatDurationLabel,
  formatTokens,
  formatUsd,
  TaskCard,
  TaskRow,
  useMergedSubmissions,
  useScoringSlaMs,
} from '@/components/trainer/TrainerDashboard';
import { useGetTrainerDashboardQuery } from '@/store/api';

// Held-in-review = the locked-token states: task started (PENDING/TRANSCRIBED,
// awaiting transcription/scoring) or SCORED but not yet SETTLED by
// settlement-job -- all three still hold tokensSpent out of the trainer's
// spendable balance (see Wallet.lockedBalance and its increment/decrement
// call sites in submissions.controller.ts, words.service.ts,
// settlement-admin.service.ts). REJECTED/EXPIRED/SETTLED all release the
// lock already, so they're deliberately excluded here.
const HELD_STATUSES = ['PENDING', 'TRANSCRIBED', 'SCORED'] as const;

export default function HeldInReviewPage() {
  const { status } = useSession();
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const { items, total, totalPages, isLoading, isFetching, isError, refetch } =
    useMergedSubmissions([...HELD_STATUSES], page, pageSize, 10000);
  const { data: dashboard } = useGetTrainerDashboardQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const now = Date.now();
  const scoringSlaLabel = formatDurationLabel(useScoringSlaMs());

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4 sm:p-6">
      <Link
        className="inline-flex items-center gap-1.5 text-sm font-bold text-accent"
        href="/dashboard"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to dashboard
      </Link>

      <div className="grid gap-2">
        <h1 className="text-3xl font-black">Held in review</h1>
        <p className="leading-relaxed text-muted">
          DL locked against tasks you&apos;ve submitted that haven&apos;t been paid out yet --
          awaiting transcription, consensus scoring, or settlement. Consensus scoring typically
          completes within {scoringSlaLabel}.
        </p>
      </div>

      {dashboard && (
        <div className={`${cardClass} flex flex-wrap items-center gap-6 p-4 md:p-5`}>
          <div>
            <p className="text-sm font-bold text-muted">Total held</p>
            <p className="mt-1 text-2xl font-black">{formatTokens(dashboard.lockedBalance)} DL</p>
            <p className="text-xs font-bold text-muted">
              ≈ {formatUsd(Number(dashboard.lockedBalance) * dashboard.tokenUsdRate)}
            </p>
          </div>
          <div>
            <p className="text-sm font-bold text-muted">Tasks awaiting payout</p>
            <p className="mt-1 text-2xl font-black">{total}</p>
          </div>
        </div>
      )}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-[#e8f0fe] text-[#3B6DF0]">
            <Clock3 className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-black">Tasks holding DL</h3>
            <p className="text-sm text-muted">
              Released back to your available balance (or paid out) once transcription, scoring,
              and settlement finish.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid min-h-52 place-items-center" role="status">
            <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
            <span className="sr-only">Loading held tasks</span>
          </div>
        ) : isError ? (
          <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
            <p className="font-extrabold">Could not load your held tasks.</p>
            <button
              className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
              onClick={() => void refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : items.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <caption className="sr-only">Tasks currently holding DL</caption>
                <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3.5" scope="col">
                      Prompt
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Dialect
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Status
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Time to scoring
                    </th>
                    <th className="px-5 py-3.5 text-right" scope="col">
                      Est. reward
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((submission) => (
                    <TaskRow key={submission.id} now={now} submission={submission} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {items.map((submission) => (
                <TaskCard key={submission.id} now={now} submission={submission} />
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel
            actionHref="/dashboard?view=training"
            actionLabel="Start training"
            icon={Headphones}
            title="Nothing held right now -- all your DL is available"
            unframed
          />
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
            <p className="text-sm font-bold text-muted">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous page"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                aria-label="Next page"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                type="button"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
