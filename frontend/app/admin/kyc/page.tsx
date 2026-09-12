'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { KycStatus, KycVerification, useListKycVerificationsQuery } from '@/store/api';
import { ProviderBadge, StatusBadge, formatDateTime } from './kyc-shared';

const statuses: ('ALL' | KycStatus)[] = [
  'IN_PROGRESS',
  'IN_REVIEW',
  'APPROVED',
  'DECLINED',
  'ABANDONED',
  'EXPIRED',
  'NOT_STARTED',
  'ALL',
];

const PAGE_SIZE = 5;
const SEARCH_DEBOUNCE_MS = 350;

export default function AdminKycPage() {
  const [status, setStatus] = useState<'ALL' | KycStatus>('IN_REVIEW');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useListKycVerificationsQuery({
    page,
    pageSize: PAGE_SIZE,
    ...(status !== 'ALL' ? { status } : {}),
    ...(search ? { search } : {}),
  });
  const rows = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">Identity verification</h1>
            <p className="mt-2 max-w-4xl text-muted">
              Review ID-scan and selfie verifications from both providers -- Didit (hosted,
              decisions made by Didit) and DLKYC (self-hosted; AI-assisted findings, if enabled,
              are shown as a reviewer aid only, never an approval).
            </p>
          </div>
          <label className="grid gap-1 text-sm font-bold">
            Status
            <select
              className="min-h-10 rounded-lg border border-line bg-white px-3"
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
              value={status}
            >
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item === 'ALL' ? 'All' : item.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email or mobile..."
            type="search"
            value={searchInput}
            aria-label="Search name, email or mobile"
          />
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-240 border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Trainer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Face match</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted" colSpan={8}>
                      Loading verifications...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center font-bold text-muted" colSpan={8}>
                      {search ? `No verifications match "${search}".` : 'No verifications in this status.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => <VerificationRow key={row.id} row={row} />)
                )}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            total={data?.total ?? 0}
            isFetching={isFetching}
            onChange={setPage}
          />
        </section>
      </div>
    </AdminShell>
  );
}

function PaginationFooter({
  currentPage,
  totalPages,
  total,
  isFetching,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  onChange: (page: number) => void;
}) {
  const buttonClass =
    'min-h-9 rounded-lg border border-line px-3 text-sm font-bold transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">
        Page {currentPage} of {totalPages} &middot; {total.toLocaleString()} total
        {isFetching ? ' - refreshing' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={currentPage <= 1}
          onClick={() => onChange(1)}
          type="button"
        >
          First
        </button>
        <button
          className={buttonClass}
          disabled={currentPage <= 1}
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          type="button"
        >
          Previous
        </button>
        <button
          className={buttonClass}
          disabled={currentPage >= totalPages}
          onClick={() => onChange(currentPage + 1)}
          type="button"
        >
          Next
        </button>
        <button
          className={buttonClass}
          disabled={currentPage >= totalPages}
          onClick={() => onChange(totalPages)}
          type="button"
        >
          Last
        </button>
      </div>
    </div>
  );
}

function VerificationRow({ row }: { row: KycVerification }) {
  const name = useMemo(
    () => [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email,
    [row.user.email, row.user.firstName, row.user.lastName],
  );

  return (
    <tr className="border-t border-line hover:bg-surface-muted">
      <td className="px-4 py-3">
        <Link className="no-underline" href={`/admin/kyc/${row.id}`}>
          <div className="font-black text-ink">{name}</div>
          <div className="text-muted">{row.user.email}</div>
        </Link>
      </td>
      <td className="px-4 py-3 text-muted">{row.user.phoneNumber ?? '--'}</td>
      <td className="px-4 py-3">
        <ProviderBadge provider={row.provider} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3">
        {row.documentType ?? '--'} {row.documentNumberMasked ? `· ${row.documentNumberMasked}` : ''}
      </td>
      <td className="px-4 py-3">{row.faceMatchScore ?? '--'}</td>
      <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
      <td className="px-4 py-3">
        <Link
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line px-3 font-bold text-ink no-underline hover:bg-white"
          href={`/admin/kyc/${row.id}`}
        >
          View
        </Link>
      </td>
    </tr>
  );
}
