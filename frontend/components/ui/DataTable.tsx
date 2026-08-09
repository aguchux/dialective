'use client';

import { useMemo, useState } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
}

type SortDirection = 'asc' | 'desc';

/**
 * Client-side sort + paginate table. Sorting/pagination happen in the
 * browser against whatever `rows` the caller already fetched -- fine at the
 * row counts admin lists run at here (users, countries, dialects), not
 * meant for server-side-paginated datasets.
 */
export function DataTable<T>({ columns, rows, rowKey, isLoading, emptyMessage = 'No results.', pageSize = 10 }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sortKey) {
      return rows;
    }
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) {
      return rows;
    }
    const sorted = [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [rows, sortKey, sortDirection, columns]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function handleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) {
      return;
    }
    if (sortKey === column.key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column.key);
      setSortDirection('asc');
    }
    setPage(0);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)] dark:bg-surface">
      {isLoading && <p className="p-4 text-muted">Loading...</p>}
      {!isLoading && rows.length === 0 && <p className="p-4 text-muted">{emptyMessage}</p>}
      {!isLoading && rows.length > 0 && (
        <>
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase text-muted">
                {columns.map((column) => (
                  <th className={`px-4 py-3 ${column.className ?? ''}`} key={column.key}>
                    {column.sortValue ? (
                      <button
                        className="inline-flex items-center gap-1 font-bold uppercase text-muted transition-colors hover:text-ink"
                        onClick={() => handleSort(column)}
                        type="button"
                      >
                        {column.header}
                        <SortIcon active={sortKey === column.key} direction={sortDirection} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr className="border-b border-line last:border-0" key={rowKey(row)}>
                  {columns.map((column) => (
                    <td className={`px-4 py-3 ${column.className ?? ''}`} key={column.key}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="text-sm text-muted">
                Page {clampedPage + 1} of {pageCount} &middot; {sortedRows.length} total
              </p>
              <div className="flex gap-2">
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={clampedPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={clampedPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${active ? 'text-accent' : 'text-muted/50'} ${
        active && direction === 'desc' ? 'rotate-180' : ''
      }`}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
