'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { useGetAdminStatsQuery, useGetReferralsQuery } from '@/store/api';

const statIconBg: Record<string, string> = {
  trainers: 'bg-[#e8f0fe] text-[#3B6DF0]',
  programs: 'bg-[#efe8fe] text-[#7B3BF0]',
  deposits: 'bg-[#e6f7ef] text-[#1AAE5C]',
  commissions: 'bg-[#fff3e0] text-[#D98A0D]',
};

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useGetAdminStatsQuery();
  const { data: referrals } = useGetReferralsQuery();

  const cards = [
    {
      key: 'trainers',
      label: 'Total Trainers',
      value: stats ? stats.totalTrainers.toLocaleString() : '-',
      icon: TrainerIcon,
    },
    {
      key: 'programs',
      label: 'Active Referral Programs',
      value: stats ? stats.activeReferralPrograms.toLocaleString() : '-',
      icon: ProgramIcon,
    },
    {
      key: 'deposits',
      label: 'Total Deposits',
      value: stats ? `$${Number(stats.totalDepositsUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-',
      icon: DepositIcon,
    },
    {
      key: 'commissions',
      label: 'Referral Commissions Paid',
      value: stats ? `${Number(stats.totalReferralCommissions).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens` : '-',
      icon: CommissionIcon,
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <h1 className="text-3xl font-black">Dashboard</h1>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Platform stats">
          {cards.map((card) => (
            <div className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]" key={card.key}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-muted">{card.label}</p>
                <span className={`grid size-9 place-items-center rounded-full ${statIconBg[card.key]}`}>
                  <card.icon />
                </span>
              </div>
              <p className="text-3xl font-black">{isLoading ? '...' : card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid content-start gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
            <h2 className="text-lg font-black">Pending withdrawals</h2>
            <p className="text-3xl font-black">{stats ? stats.pendingWithdrawals : '-'}</p>
            <p className="leading-relaxed text-muted">Awaiting admin review and payout confirmation.</p>
          </div>

          <div className="grid content-start gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
            <h2 className="text-lg font-black">Recent referrers</h2>
            {!referrals && <p className="text-muted">Loading...</p>}
            {referrals && referrals.length === 0 && <p className="text-muted">No referral commissions yet.</p>}
            <div className="grid gap-3">
              {referrals?.slice(0, 5).map((r) => (
                <div className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0" key={r.referralCode}>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{r.referrerEmail}</p>
                    <p className="text-sm text-muted">{r.referredUsers.length} referred</p>
                  </div>
                  <p className="shrink-0 font-bold text-accent">{r.totalCommission} tokens</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function TrainerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}

function ProgramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 14l2.5 2.5L16 11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.2-1 1.8-3 2.3-3 1.1-3 2.3 1.3 2.2 3 2.2 3-1.1 3-2.5" strokeLinecap="round" />
    </svg>
  );
}

function CommissionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19V9l8-5 8 5v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 19v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
