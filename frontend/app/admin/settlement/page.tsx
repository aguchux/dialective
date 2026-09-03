'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  UnsettledRow,
  normalizeErrorMessage,
  useGetUnsettledQuery,
  useSettleAllMutation,
  useSettleOneMutation,
} from '@/store/api';

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function trainerLabel(trainer: UnsettledRow['trainer']) {
  if (!trainer) return 'Unknown trainer';
  const name = [trainer.firstName, trainer.lastName].filter(Boolean).join(' ');
  return name ? `${name} (${trainer.email})` : trainer.email;
}

export default function AdminSettlementPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading, isFetching, isError, refetch } = useGetUnsettledQuery({
    page,
    pageSize,
  });
  const [settleAll, { isLoading: settlingAll }] = useSettleAllMutation();
  const [settleAllError, setSettleAllError] = useState('');
  const [settleAllResult, setSettleAllResult] = useState('');

  async function handleSettleAll(force: boolean) {
    setSettleAllError('');
    setSettleAllResult('');
    try {
      const result = await settleAll({ force }).unwrap();
      setSettleAllResult(
        `Settled ${result.settledCount}, skipped ${result.skippedDelayCount} (still in delay window), failed ${result.failedCount}.`,
      );
    } catch (err) {
      setSettleAllError(normalizeErrorMessage(err, 'Could not settle these rows'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-black">Unsettled Tasks</h1>
          <p className="mt-2 text-muted">
            Scored word recordings that have not yet been paid out. The automated settlement job
            clears these on its own schedule -- use this page to force-settle a row it
            hasn&apos;t reached yet, or one that keeps failing.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {data && data.total > 0 && (
            <div className="flex items-center gap-2">
              <ActionButton
                className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 text-sm font-extrabold"
                onClick={() => handleSettleAll(false)}
                pending={settlingAll}
                pendingLabel="Settling"
                type="button"
              >
                Settle all due
              </ActionButton>
              {data.stuckCount < data.total && (
                <ActionButton
                  className="inline-flex min-h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-extrabold text-amber-800"
                  onClick={() => handleSettleAll(true)}
                  pending={settlingAll}
                  pendingLabel="Settling"
                  type="button"
                >
                  Settle all (force, incl. pending delay)
                </ActionButton>
              )}
            </div>
          )}
        </div>

        {settleAllResult && (
          <p className="rounded-lg border border-line bg-surface p-3 text-sm font-bold text-ink">
            {settleAllResult}
          </p>
        )}
        {settleAllError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">
            {settleAllError}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3">Trainer</th>
                <th className="px-4 py-3">Tokens spent</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Scored at</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="px-4 py-5" colSpan={6}>
                    Loading unsettled tasks...
                  </td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td className="px-4 py-5" colSpan={6}>
                    <div className="flex items-center gap-3">
                      <span>Could not load unsettled tasks.</span>
                      <button
                        className="min-h-9 rounded-lg border border-line px-3 text-sm font-extrabold hover:bg-surface-muted"
                        onClick={() => void refetch()}
                        type="button"
                      >
                        Try again
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !isError && data && data.items.length === 0 && (
                <tr>
                  <td className="px-4 py-5" colSpan={6}>
                    Nothing unsettled -- the automated job is fully caught up.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !isError &&
                data?.items.map((row) => <UnsettledTaskRow key={row.id} row={row} />)}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {isFetching ? 'Refreshing...' : `${data.total} unsettled`}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:opacity-45"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                ←
              </button>
              <span className="min-w-16 text-center font-bold text-ink">
                {page} / {data.totalPages}
              </span>
              <button
                className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:opacity-45"
                disabled={page >= data.totalPages}
                onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
                type="button"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function UnsettledTaskRow({ row }: { row: UnsettledRow }) {
  const [settleOne, { isLoading }] = useSettleOneMutation();
  const [error, setError] = useState('');

  async function handleSettle(force: boolean) {
    setError('');
    try {
      await settleOne({ id: row.id, force }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not settle this task'));
    }
  }

  return (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3">{trainerLabel(row.trainer)}</td>
      <td className="px-4 py-3">{row.tokensSpent} DL</td>
      <td className="px-4 py-3">{row.score ?? '—'}</td>
      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.scoredAt)}</td>
      <td className="px-4 py-3">
        {row.missingScore ? (
          <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-black text-danger">
            No score
          </span>
        ) : row.pendingDelay ? (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">
            Pending delay
          </span>
        ) : (
          <span className="rounded-md bg-surface px-2 py-1 text-xs font-black text-muted">
            Stuck
          </span>
        )}
        {error && <p className="mt-1 text-xs font-bold text-danger">{error}</p>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <ActionButton
            className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold disabled:opacity-50"
            disabled={row.missingScore}
            onClick={() => handleSettle(false)}
            pending={isLoading}
            pendingLabel="Settling"
            type="button"
          >
            Settle
          </ActionButton>
          {row.pendingDelay && (
            <ActionButton
              className="min-h-8 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-extrabold text-amber-800 disabled:opacity-50"
              onClick={() => handleSettle(true)}
              pending={isLoading}
              pendingLabel="Settling"
              type="button"
            >
              Settle now (force)
            </ActionButton>
          )}
        </div>
      </td>
    </tr>
  );
}
