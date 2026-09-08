'use client';

import { useMemo, useState } from 'react';
import { CircleDollarSign } from 'lucide-react';
import { cardClass, EmptyPanel, formatDate } from '@/components/dashboard/shared';
import { formatTokens } from '@/components/trainer/TrainerDashboard';
import { useGetWalletActivityQuery } from '@/store/api';

/**
 * Phase 3 (docs/validators.md): the validator's own VALIDATION_REWARD
 * ledger history. GET /wallet/activity is already generic over every
 * LedgerEntryType (WalletController.listActivity has no type filter in its
 * where clause), so this reuses it as-is rather than adding a new endpoint
 * -- filtering to VALIDATION_REWARD is done client-side against the same
 * paginated feed the trainer Tokens tab already consumes (see
 * TrainerDashboard.tsx's TokensView/ActivityList for the equivalent
 * trainer-side rendering this mirrors).
 */
export function EarningsView() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading, isFetching, isError, refetch } = useGetWalletActivityQuery({
    page,
    pageSize,
  });

  const validationEntries = useMemo(
    () => (data?.items ?? []).filter((entry) => entry.type === 'VALIDATION_REWARD'),
    [data],
  );
  const pageTotal = useMemo(
    () => validationEntries.reduce((sum, entry) => sum + Number(entry.amount), 0),
    [validationEntries],
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-black">Validation earnings</h2>
        <p className="text-sm text-muted">
          DL credited to you when a deck you contributed to (as creator, approver, or reassigned
          owner) is published. New tokens are minted on publish -- see the deck&apos;s expected
          earning preview before then.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div className="h-16 animate-pulse rounded-lg bg-surface-muted" key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="grid min-h-40 place-items-center gap-3 rounded-lg border border-line p-5 text-center">
          <p className="font-extrabold">Could not load your earnings.</p>
          <button
            className="min-h-9 rounded-lg border border-line px-3.5 text-sm font-bold hover:bg-surface-muted"
            onClick={() => void refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : validationEntries.length === 0 ? (
        <EmptyPanel icon={CircleDollarSign} title="Your validation earnings will appear here" />
      ) : (
        <>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-bold uppercase text-muted">This page&apos;s total</p>
            <p className="text-2xl font-black">{formatTokens(pageTotal)} DL</p>
          </div>
          <div className={`${cardClass} divide-y divide-line overflow-hidden`}>
            {validationEntries.map((entry) => (
              <div className="flex items-center justify-between gap-3 p-3.5" key={entry.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">Validation reward</p>
                  <p className="truncate font-mono text-xs text-muted">{entry.reference}</p>
                  <p className="text-xs text-muted">{formatDate(entry.createdAt)}</p>
                </div>
                <p className="shrink-0 text-sm font-black text-emerald-700 dark:text-emerald-300">
                  +{formatTokens(entry.amount)} DL
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span>
            Page {page} of {data.totalPages}
            {isFetching ? ' · refreshing…' : ''}
          </span>
          <div className="flex gap-2">
            <button
              className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold disabled:opacity-45"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold disabled:opacity-45"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
