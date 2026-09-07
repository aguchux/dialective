'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  /** Excludes this column from the search box's match (e.g. an actions column with buttons, not data). Defaults to included whenever sortValue is set. */
  searchable?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  /** Offers a page-size <select> next to the pagination controls, letting the viewer widen/narrow how many rows show per page. Values shown are pageSizeOptions (default [5, 10, 20, 50]); the initial value is `pageSize`. */
  adjustablePageSize?: boolean;
  pageSizeOptions?: number[];
  /** Set false when the page already has its own (e.g. server-side) search UI, to avoid a redundant second search box. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

type SortDirection = 'asc' | 'desc';

/**
 * Client-side search + sort + paginate table. All three happen in the
 * browser against whatever `rows` the caller already fetched -- fine at the
 * row counts admin lists run at here (users, countries, dialects, pools),
 * not meant for server-side-paginated datasets (see the words/prompts admin
 * page, which searches server-side instead for that reason).
 *
 * Responsive like the trainer dashboard's My Tasks table
 * (TrainerDashboard.tsx's MyTasksView/TaskRow/TaskCard): a <table> on
 * md+ screens, a stacked label:value card list below md, both fed by the
 * same columns/rows so every existing column definition works unchanged.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  emptyMessage = 'No results.',
  pageSize: initialPageSize = 10,
  adjustablePageSize = false,
  pageSizeOptions = [5, 10, 20, 50],
  searchable = true,
  searchPlaceholder = 'Search...',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const searchableColumns = useMemo(
    () => columns.filter((c) => c.sortValue && c.searchable !== false),
    [columns],
  );

  const filteredRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || searchableColumns.length === 0) return rows;
    return rows.filter((row) =>
      searchableColumns.some((column) =>
        String(column.sortValue!(row)).toLowerCase().includes(trimmed),
      ),
    );
  }, [rows, query, searchableColumns]);

  const sortedRows = useMemo(() => {
    if (!sortKey) {
      return filteredRows;
    }
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) {
      return filteredRows;
    }
    const sorted = [...filteredRows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredRows, sortKey, sortDirection, columns]);

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

  function handleSearchChange(value: string) {
    setQuery(value);
    setPage(0);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)] dark:bg-surface">
      {searchable && searchableColumns.length > 0 && (
        <div className="border-b border-line p-3">
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink dark:bg-surface-muted"
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={query}
              aria-label={searchPlaceholder}
            />
          </div>
        </div>
      )}

      {isLoading && <p className="p-4 text-muted">Loading...</p>}
      {!isLoading && rows.length === 0 && <p className="p-4 text-muted">{emptyMessage}</p>}
      {!isLoading && rows.length > 0 && sortedRows.length === 0 && (
        <p className="p-4 text-muted">No results match &ldquo;{query}&rdquo;.</p>
      )}
      {!isLoading && sortedRows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
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
          </div>

          <div className="divide-y divide-line md:hidden">
            {pageRows.map((row) => (
              <article className="grid gap-2 p-4" key={rowKey(row)}>
                {columns.map((column) => (
                  <div className="flex items-start justify-between gap-3" key={column.key}>
                    <span className="shrink-0 text-xs font-bold uppercase text-muted">
                      {column.header}
                    </span>
                    <div className="min-w-0 text-right">{column.render(row)}</div>
                  </div>
                ))}
              </article>
            ))}
          </div>

          {(pageCount > 1 || adjustablePageSize) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="text-sm text-muted">
                Page {clampedPage + 1} of {pageCount} &middot; {sortedRows.length} total
              </p>
              <div className="flex items-center gap-3">
                {adjustablePageSize && (
                  <label className="flex items-center gap-1.5 text-sm text-muted">
                    Rows per page
                    <select
                      className="min-h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink dark:bg-surface-muted"
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(0);
                      }}
                      value={pageSize}
                    >
                      {pageSizeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {pageCount > 1 && (
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
                )}
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
