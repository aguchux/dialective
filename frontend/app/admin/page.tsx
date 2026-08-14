'use client';

import {
  BadgeDollarSign,
  BookOpenText,
  CircleDollarSign,
  Clock3,
  Database,
  FileText,
  Globe2,
  Landmark,
  Languages,
  LibraryBig,
  ListChecks,
  MailCheck,
  Mic2,
  Newspaper,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { formatCompactTokens, formatCompactUsd } from '@/lib/format';
import { useGetAdminStatsQuery, useGetReferralsQuery } from '@/store/api';

type StatTone = 'blue' | 'purple' | 'green' | 'amber' | 'cyan' | 'rose';

type DashboardCard = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone: StatTone;
};

const toneClass: Record<StatTone, string> = {
  blue: 'bg-[#e8f0fe] text-[#3B6DF0]',
  purple: 'bg-[#efe8fe] text-[#7B3BF0]',
  green: 'bg-[#e6f7ef] text-[#1AAE5C]',
  amber: 'bg-[#fff3e0] text-[#D98A0D]',
  cyan: 'bg-[#e6f6fb] text-[#0E8AA6]',
  rose: 'bg-[#fee8ef] text-[#D9366A]',
};

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useGetAdminStatsQuery();
  const { data: referrals } = useGetReferralsQuery();
  const loadingValue = isLoading ? '...' : '-';

  const platformCards: DashboardCard[] = [
    {
      key: 'users',
      label: 'Total users',
      value: stats ? formatCount(stats.totalUsers) : loadingValue,
      hint: stats ? `${formatCount(stats.verifiedUsers)} verified` : undefined,
      icon: Users,
      tone: 'blue',
    },
    {
      key: 'trainers',
      label: 'Trainers',
      value: stats ? formatCount(stats.totalTrainers) : loadingValue,
      hint: stats ? `${formatCount(stats.activeUsers)} active accounts` : undefined,
      icon: Mic2,
      tone: 'purple',
    },
    {
      key: 'admins',
      label: 'Admins',
      value: stats ? formatCount(stats.totalAdmins) : loadingValue,
      hint: stats ? `${formatCount(stats.suspendedUsers)} suspended users` : undefined,
      icon: ShieldCheck,
      tone: 'amber',
    },
    {
      key: 'leads',
      label: 'Data buyer leads',
      value: stats ? formatCount(stats.dataAccessLeads) : loadingValue,
      hint: 'Enterprise pipeline',
      icon: MailCheck,
      tone: 'green',
    },
  ];

  const contentCards: DashboardCard[] = [
    {
      key: 'words',
      label: 'Words',
      value: stats ? formatCount(stats.wordsCount) : loadingValue,
      hint: stats ? `${formatCount(stats.wordTranslationsCount)} translations` : undefined,
      icon: LibraryBig,
      tone: 'purple',
    },
    {
      key: 'prompts',
      label: 'Prompts',
      value: stats ? formatCount(stats.promptsCount) : loadingValue,
      hint: stats ? `${formatCount(stats.activePromptsCount)} active` : undefined,
      icon: BookOpenText,
      tone: 'blue',
    },
    {
      key: 'promptTranslations',
      label: 'Prompt translations',
      value: stats ? formatCount(stats.promptTranslationsCount) : loadingValue,
      hint: 'Generated dialect prompts',
      icon: Languages,
      tone: 'cyan',
    },
    {
      key: 'coverage',
      label: 'Coverage',
      value: stats ? `${formatCount(stats.countriesCount)} / ${formatCount(stats.dialectsCount)}` : loadingValue,
      hint: 'Countries / dialects',
      icon: Globe2,
      tone: 'green',
    },
    {
      key: 'blog',
      label: 'Blog posts',
      value: stats ? formatCount(stats.blogPostsCount) : loadingValue,
      hint: stats ? `${formatCount(stats.publishedBlogPostsCount)} published, ${formatCount(stats.draftBlogPostsCount)} draft` : undefined,
      icon: Newspaper,
      tone: 'amber',
    },
  ];

  const trainingCards: DashboardCard[] = [
    {
      key: 'sessions',
      label: 'Training sessions',
      value: stats ? formatCount(stats.trainingSessionsCount) : loadingValue,
      hint: 'Consent-backed sessions',
      icon: ListChecks,
      tone: 'green',
    },
    {
      key: 'wordRecordings',
      label: 'Word recordings',
      value: stats ? formatCount(stats.wordRecordingsCount) : loadingValue,
      hint: stats ? `${formatCount(stats.wordRecordingsPending)} pending` : undefined,
      icon: Mic2,
      tone: 'purple',
    },
    {
      key: 'wordScored',
      label: 'Words scored',
      value: stats ? formatCount(stats.wordRecordingsScored) : loadingValue,
      hint: stats ? `${formatCount(stats.wordRecordingsSettled)} settled` : undefined,
      icon: Sparkles,
      tone: 'blue',
    },
    {
      key: 'submissions',
      label: 'Sentence submissions',
      value: stats ? formatCount(stats.submissionsCount) : loadingValue,
      hint: stats ? `${formatCount(stats.submissionsPending)} pending ASR` : undefined,
      icon: FileText,
      tone: 'cyan',
    },
    {
      key: 'scoredSubmissions',
      label: 'Submissions scored',
      value: stats ? formatCount(stats.submissionsScored) : loadingValue,
      hint: stats
        ? `${formatCount(stats.submissionsTranscribed)} transcribed, ${formatCount(stats.submissionsRejected)} rejected`
        : undefined,
      icon: Database,
      tone: 'amber',
    },
    {
      key: 'settledSubmissions',
      label: 'Submissions settled',
      value: stats ? formatCount(stats.submissionsSettled) : loadingValue,
      hint: 'Paid by settlement job',
      icon: CircleDollarSign,
      tone: 'green',
    },
  ];

  const economyCards: DashboardCard[] = [
    {
      key: 'depositsUsd',
      label: 'Total deposits',
      value: stats ? formatCompactUsd(stats.totalDepositsUsd) : loadingValue,
      hint: stats ? `${formatCount(stats.confirmedDeposits)} confirmed` : undefined,
      icon: CircleDollarSign,
      tone: 'green',
    },
    {
      key: 'tokensFunded',
      label: 'DL funded',
      value: stats ? formatCompactTokens(stats.totalTokensFunded) : loadingValue,
      hint: stats ? `${formatCount(stats.pendingDeposits)} pending deposits` : undefined,
      icon: WalletCards,
      tone: 'purple',
    },
    {
      key: 'walletBalance',
      label: 'Wallet balances',
      value: stats ? formatCompactTokens(stats.totalWalletBalance) : loadingValue,
      hint: stats ? `${formatCount(stats.walletsCount)} wallets` : undefined,
      icon: PiggyBank,
      tone: 'blue',
    },
    {
      key: 'lockedTokens',
      label: 'Locked DL',
      value: stats ? formatCompactTokens(stats.totalLockedTokens) : loadingValue,
      hint: 'Tasks awaiting score/settlement',
      icon: Clock3,
      tone: 'amber',
    },
    {
      key: 'trainingPayouts',
      label: 'Training payouts',
      value: stats ? formatCompactTokens(stats.totalTrainingPayouts) : loadingValue,
      hint: 'Trainer work credited',
      icon: BadgeDollarSign,
      tone: 'green',
    },
    {
      key: 'referralBonuses',
      label: 'Referral bonuses',
      value: stats ? formatCompactTokens(stats.totalReferralBonuses) : loadingValue,
      hint: stats
        ? `Funding ${formatPercent(stats.referralSettings.fundingBonusRate, stats.referralSettings.fundingBonusEnabled)}`
        : undefined,
      icon: Landmark,
      tone: 'amber',
    },
    {
      key: 'pendingWithdrawals',
      label: 'Pending withdrawals',
      value: stats ? formatCount(stats.pendingWithdrawals) : loadingValue,
      hint: stats ? `${formatCompactTokens(stats.pendingWithdrawalTokens)} awaiting review` : undefined,
      icon: Clock3,
      tone: 'rose',
    },
    {
      key: 'withdrawn',
      label: 'Paid withdrawals',
      value: stats ? formatCompactTokens(stats.totalWithdrawnTokens) : loadingValue,
      hint: stats ? `${formatCompactUsd(stats.totalWithdrawnUsdt)} USDT equivalent` : undefined,
      icon: CircleDollarSign,
      tone: 'cyan',
    },
    {
      key: 'rewardPools',
      label: 'Reward pools',
      value: stats ? formatCount(stats.activeSubscriptionPools) : loadingValue,
      hint: stats ? `${formatCompactUsd(stats.activeSubscriptionPoolUsd)} active funding` : undefined,
      icon: Database,
      tone: 'blue',
    },
    {
      key: 'ipnEvents',
      label: 'NOWPayments IPNs',
      value: stats ? formatCount(stats.ipnEventsCount) : loadingValue,
      hint: 'Webhook notifications received',
      icon: ListChecks,
      tone: 'purple',
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-black">Dashboard</h1>
          <p className="mt-2 max-w-4xl text-muted">
            Platform health, content inventory, trainer activity, and DL economy at a glance.
          </p>
        </div>

        <MetricSection cards={platformCards} title="Platform" />
        <MetricSection cards={contentCards} title="Content & coverage" />
        <MetricSection cards={trainingCards} title="Training pipeline" />
        <MetricSection cards={economyCards} title="DL economy" />

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid content-start gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
            <h2 className="text-lg font-black">Operations queue</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <QueueItem label="Withdrawals" value={stats ? formatCount(stats.pendingWithdrawals) : loadingValue} />
              <QueueItem label="Pending deposits" value={stats ? formatCount(stats.pendingDeposits) : loadingValue} />
              <QueueItem label="Pending word scores" value={stats ? formatCount(stats.wordRecordingsPending) : loadingValue} />
            </div>
          </div>

          <div className="grid content-start gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
            <h2 className="text-lg font-black">Recent referrers</h2>
            {!referrals && <p className="text-muted">Loading...</p>}
            {referrals && referrals.length === 0 && <p className="text-muted">No referral bonuses yet.</p>}
            <div className="grid gap-3">
              {referrals?.slice(0, 5).map((r) => (
                <div className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0" key={r.referralCode}>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{r.referrerEmail}</p>
                    <p className="text-sm text-muted">{r.referredUsers.length} referred</p>
                  </div>
                  <p className="shrink-0 font-bold text-accent">{formatCompactTokens(r.totalCommission)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function MetricSection({ cards, title }: { cards: DashboardCard[]; title: string }) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="text-lg font-black">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {cards.map((card) => (
          <MetricCard card={card} key={card.key} />
        ))}
      </div>
    </section>
  );
}

function MetricCard({ card }: { card: DashboardCard }) {
  const Icon = card.icon;
  return (
    <div className="grid min-h-32 content-between gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-muted">{card.label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${toneClass[card.tone]}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="grid gap-1">
        <p className="break-words text-3xl font-black">{card.value}</p>
        {card.hint && <p className="text-sm leading-snug text-muted">{card.hint}</p>}
      </div>
    </div>
  );
}

function QueueItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatPercent(rate: string, enabled: boolean): string {
  if (!enabled) return 'off';
  return `${(Number(rate) * 100).toFixed(2)}%`;
}
