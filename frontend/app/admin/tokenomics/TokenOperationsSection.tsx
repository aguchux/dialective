'use client';

import { Fragment, useState } from 'react';
import { normalizeErrorMessage, useListTokenOperationsQuery } from '@/store/api';
import { secondaryButtonClass } from './shared';

const TYPE_OPTIONS = [
  'MINT',
  'TRANSFER',
  'LOCK',
  'UNLOCK',
  'BURN',
  'REDEEM',
  'ADJUSTMENT',
  'TREASURY_ALLOCATION',
];
const STATUS_OPTIONS = ['PENDING', 'SETTLED', 'REVERSED', 'CANCELLED'];

const selectClass =
  'min-h-9 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink dark:bg-surface-muted';

export function TokenOperationsSection() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useListTokenOperationsQuery({
    page,
    pageSize: 20,
    type: type || undefined,
    status: status || undefined,
  });

  function resetToFirstPage(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl leading-snug">Token operations</h2>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by type"
            className={selectClass}
            onChange={(e) => resetToFirstPage(setType)(e.target.value)}
            value={type}
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            className={selectClass}
            onChange={(e) => resetToFirstPage(setStatus)(e.target.value)}
            value={status}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isError && (
        <p className="leading-relaxed text-danger" role="alert">
          {normalizeErrorMessage(error, 'Unable to load token operations.')}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-bold uppercase text-muted">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Entries</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted" colSpan={6}>
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted" colSpan={6}>
                  No token operations found.
                </td>
              </tr>
            )}
            {data?.items.map((row) => {
              const expanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{row.type}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{row.reference ?? '-'}</td>
                    <td className="px-4 py-3">{row.reason ?? '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        className="font-bold text-accent hover:underline"
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        type="button"
                      >
                        {row.entries.length} {expanded ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-line last:border-0">
                      <td className="bg-surface-muted px-4 py-3" colSpan={6}>
                        <ul className="grid gap-1 text-sm">
                          {row.entries.map((entry) => (
                            <li key={entry.id}>
                              <span className="font-bold">{entry.account.code}</span> (
                              {entry.account.kind}) &middot; available Δ {entry.availableDelta}
                              &middot; locked Δ {entry.lockedDelta}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              className={secondaryButtonClass}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className={secondaryButtonClass}
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
