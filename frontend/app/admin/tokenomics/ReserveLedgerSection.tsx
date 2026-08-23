'use client';

import { useState } from 'react';
import { normalizeErrorMessage, useListReserveTransactionsQuery } from '@/store/api';
import { secondaryButtonClass } from './shared';

const TYPE_OPTIONS = [
  'INITIAL_RESERVE',
  'PAYMENT_FUNDING',
  'BUSINESS_REVENUE',
  'RESERVE_ALLOCATION',
  'REDEMPTION',
  'FEE',
  'REFUND',
  'REVERSAL',
  'ADJUSTMENT',
  'OTHER',
];
const STATUS_OPTIONS = ['PENDING', 'ELIGIBLE', 'EXCLUDED', 'REVERSED'];
const DIRECTION_OPTIONS = ['CREDIT', 'DEBIT'];

const selectClass =
  'min-h-9 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink dark:bg-surface-muted';

export function ReserveLedgerSection() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');

  const { data, isLoading, isError, error } = useListReserveTransactionsQuery({
    page,
    pageSize: 20,
    type: type || undefined,
    status: status || undefined,
    direction: direction || undefined,
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
        <h2 className="text-2xl leading-snug">Reserve transactions</h2>
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
          <select
            aria-label="Filter by direction"
            className={selectClass}
            onChange={(e) => resetToFirstPage(setDirection)(e.target.value)}
            value={direction}
          >
            <option value="">All directions</option>
            {DIRECTION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isError && (
        <p className="leading-relaxed text-danger" role="alert">
          {normalizeErrorMessage(error, 'Unable to load reserve transactions.')}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-bold uppercase text-muted">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Eligible USD</th>
              <th className="px-4 py-3">Provider ref</th>
              <th className="px-4 py-3">Source ref</th>
              <th className="px-4 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted" colSpan={9}>
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted" colSpan={9}>
                  No reserve transactions found.
                </td>
              </tr>
            )}
            {data?.items.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.direction}</td>
                <td className="px-4 py-3">
                  {row.amount} {row.reserveAccount.asset}
                </td>
                <td className="px-4 py-3">${row.eligibleUsdAmount}</td>
                <td className="px-4 py-3">{row.providerReference ?? '-'}</td>
                <td className="px-4 py-3">{row.sourceReference ?? '-'}</td>
                <td className="px-4 py-3">{row.reason ?? '-'}</td>
              </tr>
            ))}
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
