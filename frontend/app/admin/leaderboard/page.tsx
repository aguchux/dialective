'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeDollarSign, Trophy } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { formatCompactTokens } from '@/lib/format';
import {
  AdminLeaderboardUser,
  KycStatus,
  LeaderboardContributorRow,
  LeaderboardEarnerRow,
  useGetAdminLeaderboardContributorsQuery,
  useGetAdminLeaderboardEarnersQuery,
} from '@/store/api';

const tabs = [
  { key: 'earners', label: 'Top earners', icon: BadgeDollarSign },
  { key: 'contributors', label: 'Top contributors', icon: Trophy },
] as const;

type TabKey = (typeof tabs)[number]['key'];
// Fetched in one shot so the DataTable's client-side smart search can match
// against every ranked row, not just whatever page the server handed back.
const LEADERBOARD_FETCH_SIZE = 200;

const kycStyles: Record<KycStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  IN_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-red-50 text-red-700',
  ABANDONED: 'bg-slate-100 text-slate-700',
  EXPIRED: 'bg-slate-100 text-slate-700',
};

function KycBadge({ status }: { status: KycStatus }) {
  return (
    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${kycStyles[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function MobileCell({ user }: { user: AdminLeaderboardUser }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm text-ink">{user.phoneNumber ?? 'No mobile number'}</span>
      <span
        className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-bold ${
          user.phoneVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}
      >
        {user.phoneVerified ? 'Verified' : 'Unverified'}
      </span>
    </div>
  );
}

function searchValue(user: AdminLeaderboardUser, ...rest: (string | number)[]) {
  return [
    user.firstName ?? '',
    user.lastName ?? '',
    user.email,
    user.role,
    user.phoneNumber ?? '',
    user.kycStatus,
    ...rest,
  ]
    .join(' ')
    .toLowerCase();
}

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
  const { data, isLoading, isError, refetch } = useGetAdminLeaderboardEarnersQuery({
    page: 1,
    pageSize: LEADERBOARD_FETCH_SIZE,
  });

  const rows = data?.items ?? [];
  const rankByUserId = new Map(rows.map((row, index) => [row.user.id, index + 1]));

  const columns: DataTableColumn<LeaderboardEarnerRow>[] = [
    {
      key: 'rank',
      header: 'Rank',
      sortValue: (row) => rankByUserId.get(row.user.id) ?? 0,
      searchable: false,
      render: (row) => (
        <span className="font-extrabold text-muted">{rankByUserId.get(row.user.id)}</span>
      ),
    },
    {
      key: 'trainer',
      header: 'Trainer',
      sortValue: (row) => searchValue(row.user),
      render: (row) => <UserCell user={row.user} />,
    },
    {
      key: 'mobile',
      header: 'Mobile',
      sortValue: (row) => row.user.phoneNumber ?? '',
      render: (row) => <MobileCell user={row.user} />,
    },
    {
      key: 'kyc',
      header: 'KYC status',
      sortValue: (row) => row.user.kycStatus,
      render: (row) => <KycBadge status={row.user.kycStatus} />,
    },
    {
      key: 'totalEarned',
      header: 'DL earned',
      sortValue: (row) => Number(row.totalEarned),
      searchable: false,
      render: (row) => (
        <span className="font-extrabold text-accent">{formatCompactTokens(row.totalEarned)}</span>
      ),
    },
    {
      key: 'payoutCount',
      header: 'Payouts',
      sortValue: (row) => row.payoutCount,
      searchable: false,
      render: (row) => <span className="text-muted">{row.payoutCount.toLocaleString()}</span>,
    },
  ];

  if (isError) {
    return (
      <section className="rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <ErrorState onRetry={() => void refetch()} />
      </section>
    );
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.user.id}
      isLoading={isLoading}
      emptyMessage="No task payouts yet."
      adjustablePageSize
      pageSize={20}
      searchPlaceholder="Search name, email, mobile, role or KYC status..."
    />
  );
}

function ContributorsTab() {
  const { data, isLoading, isError, refetch } = useGetAdminLeaderboardContributorsQuery({
    page: 1,
    pageSize: LEADERBOARD_FETCH_SIZE,
  });

  const rows = data?.items ?? [];
  const rankByUserId = new Map(rows.map((row, index) => [row.user.id, index + 1]));

  const columns: DataTableColumn<LeaderboardContributorRow>[] = [
    {
      key: 'rank',
      header: 'Rank',
      sortValue: (row) => rankByUserId.get(row.user.id) ?? 0,
      searchable: false,
      render: (row) => (
        <span className="font-extrabold text-muted">{rankByUserId.get(row.user.id)}</span>
      ),
    },
    {
      key: 'trainer',
      header: 'Trainer',
      sortValue: (row) => searchValue(row.user),
      render: (row) => <UserCell user={row.user} />,
    },
    {
      key: 'mobile',
      header: 'Mobile',
      sortValue: (row) => row.user.phoneNumber ?? '',
      render: (row) => <MobileCell user={row.user} />,
    },
    {
      key: 'kyc',
      header: 'KYC status',
      sortValue: (row) => row.user.kycStatus,
      render: (row) => <KycBadge status={row.user.kycStatus} />,
    },
    {
      key: 'totalTasks',
      header: 'Total tasks',
      sortValue: (row) => row.totalTasks,
      searchable: false,
      render: (row) => <span className="font-extrabold">{row.totalTasks.toLocaleString()}</span>,
    },
    {
      key: 'wordRecordings',
      header: 'Words',
      sortValue: (row) => row.wordRecordings,
      searchable: false,
      render: (row) => <span className="text-muted">{row.wordRecordings.toLocaleString()}</span>,
    },
    {
      key: 'submissions',
      header: 'Sentences',
      sortValue: (row) => row.submissions,
      searchable: false,
      render: (row) => <span className="text-muted">{row.submissions.toLocaleString()}</span>,
    },
  ];

  if (isError) {
    return (
      <section className="rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <ErrorState onRetry={() => void refetch()} />
      </section>
    );
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.user.id}
      isLoading={isLoading}
      emptyMessage="No submitted tasks yet."
      adjustablePageSize
      pageSize={20}
      searchPlaceholder="Search name, email, mobile, role or KYC status..."
    />
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
      <button
        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
