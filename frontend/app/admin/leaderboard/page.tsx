'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeDollarSign, Trophy } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { formatCompactTokens } from '@/lib/format';
import {
  AdminLeaderboardUser,
  useGetAdminLeaderboardContributorsQuery,
  useGetAdminLeaderboardEarnersQuery,
} from '@/store/api';

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

const tabs = [
  { key: 'earners', label: 'Top earners', icon: BadgeDollarSign },
  { key: 'contributors', label: 'Top contributors', icon: Trophy },
] as const;

type TabKey = (typeof tabs)[number]['key'];
const PAGE_SIZE = 20;

export default function AdminLeaderboardPage() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: TabKey = requestedTab === 'contributors' ? 'contributors' : 'earners';
  const [active, setActive] = useState<TabKey>(initialTab);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Leaderboard</h1>
          <p className="leading-relaxed text-muted">
            Ranked by DL earned through task payouts (not admin credits or transfers) and by tasks
            submitted. Ranks up to the top 200 trainers on each list.
          </p>
        </div>

        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  active === tab.key
                    ? 'bg-accent text-white'
                    : 'bg-white text-ink hover:bg-surface-muted'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {active === 'earners' && <EarnersTab />}
        {active === 'contributors' && <ContributorsTab />}
      </div>
    </AdminShell>
  );
}

function EarnersTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetAdminLeaderboardEarnersQuery({
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <section className="grid gap-4 overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      {isLoading ? (
        <p className="p-5 text-muted">Loading...</p>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-180 border-collapse text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                <tr>
                  <th className="px-5 py-3.5" scope="col">
                    Rank
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Trainer
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    DL earned
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Payouts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((row, index) => (
                  <tr key={row.user.id}>
                    <td className="px-5 py-3.5 font-extrabold text-muted">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <UserCell user={row.user} />
                    </td>
                    <td className="px-5 py-3.5 font-extrabold text-accent">
                      {formatCompactTokens(row.totalEarned)}
                    </td>
                    <td className="px-5 py-3.5 text-muted">{row.payoutCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {data.items.map((row, index) => (
              <article className="grid gap-2 p-4" key={row.user.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-extrabold text-muted">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </span>
                    <UserCell user={row.user} />
                  </div>
                  <p className="shrink-0 font-extrabold text-accent">
                    {formatCompactTokens(row.totalEarned)}
                  </p>
                </div>
                <p className="text-xs text-muted">{row.payoutCount.toLocaleString()} payouts</p>
              </article>
            ))}
          </div>

          <PaginationFooter
            page={data.page}
            totalPages={data.totalPages}
            isFetching={isFetching}
            onChange={setPage}
          />
        </>
      ) : (
        <p className="p-5 text-muted">No task payouts yet.</p>
      )}
    </section>
  );
}

function ContributorsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetAdminLeaderboardContributorsQuery(
    { page, pageSize: PAGE_SIZE },
  );

  return (
    <section className="grid gap-4 overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      {isLoading ? (
        <p className="p-5 text-muted">Loading...</p>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-180 border-collapse text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                <tr>
                  <th className="px-5 py-3.5" scope="col">
                    Rank
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Trainer
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Total tasks
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Words
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Sentences
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((row, index) => (
                  <tr key={row.user.id}>
                    <td className="px-5 py-3.5 font-extrabold text-muted">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <UserCell user={row.user} />
                    </td>
                    <td className="px-5 py-3.5 font-extrabold">
                      {row.totalTasks.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {row.wordRecordings.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-muted">{row.submissions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {data.items.map((row, index) => (
              <article className="grid gap-2 p-4" key={row.user.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-extrabold text-muted">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </span>
                    <UserCell user={row.user} />
                  </div>
                  <p className="shrink-0 font-extrabold">{row.totalTasks.toLocaleString()} tasks</p>
                </div>
                <p className="text-xs text-muted">
                  {row.wordRecordings.toLocaleString()} words, {row.submissions.toLocaleString()}{' '}
                  sentences
                </p>
              </article>
            ))}
          </div>

          <PaginationFooter
            page={data.page}
            totalPages={data.totalPages}
            isFetching={isFetching}
            onChange={setPage}
          />
        </>
      ) : (
        <p className="p-5 text-muted">No submitted tasks yet.</p>
      )}
    </section>
  );
}

function UserCell({ user }: { user: AdminLeaderboardUser }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return (
    <div className="min-w-0">
      <p className="truncate font-extrabold">{name || user.email}</p>
      {name && <p className="truncate text-xs text-muted">{user.email}</p>}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid gap-3 p-5 text-center">
      <p className="font-extrabold">Could not load the leaderboard.</p>
      <button className={secondaryButtonClass} onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  isFetching,
  onChange,
}: {
  page: number;
  totalPages: number;
  isFetching: boolean;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
      <p className="text-sm text-muted">
        Page {page} of {totalPages} {isFetching ? '· refreshing…' : ''}
      </p>
      <div className="flex gap-2">
        <button
          className={secondaryButtonClass}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className={secondaryButtonClass}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
