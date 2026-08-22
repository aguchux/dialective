'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Copy, Network, RefreshCw, Store, Users, WalletCards } from 'lucide-react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { formatTokens } from '@/components/distributor/format';
import { useGetDistributorDashboardQuery } from '@/store/api';

export default function DistributorDashboardPage() {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isFetching, refetch } = useGetDistributorDashboardQuery();

  const referralLink = useMemo(() => {
    if (!data?.profile.referralCode || typeof window === 'undefined') return '';
    return `${window.location.origin}/register?ref=${data.profile.referralCode}`;
  }, [data?.profile.referralCode]);

  async function copyReferral() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <DistributorShell>
      <div className="grid gap-6">
        {isLoading && <p className="text-muted">Loading distributor dashboard...</p>}
        {data && (
          <>
            <section className="grid gap-5 border-b border-line pb-6 md:grid-cols-[1fr_auto] md:items-end">
              <div className="grid gap-2">
                <p className="text-sm font-bold text-accent">Distributor network</p>
                <h1 className="text-3xl font-black leading-tight sm:text-5xl">
                  {data.profile.name}
                </h1>
                <p className="max-w-2xl text-muted">
                  Broker DL tokens through P2P, direct network referrals, and configured multi-level
                  commissions.
                </p>
              </div>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 font-extrabold text-ink hover:bg-surface-muted"
                onClick={() => refetch()}
                type="button"
              >
                <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </section>

            {!data.settings.enabled && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 font-bold text-amber-800">
                Distributor features are currently disabled by admin.
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={WalletCards}
                label="Available DL"
                value={formatTokens(data.wallet.balance)}
              />
              <Metric
                icon={Users}
                label="Network members"
                value={data.metrics.networkMembers.toLocaleString()}
              />
              <Metric
                icon={Network}
                label="Network DL balance"
                value={formatTokens(data.metrics.networkTokenBalance)}
              />
              <Metric
                icon={Store}
                label="Referral bonuses"
                value={formatTokens(data.metrics.referralBonuses)}
              />
            </section>

            {data.referralBonusesByLevel.length > 0 && (
              <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
                <h2 className="text-xl font-black">Referral bonuses by level</h2>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {data.referralBonusesByLevel.map((level) => (
                    <div
                      className="rounded-lg border border-line bg-surface-muted p-3"
                      key={level.level}
                    >
                      <p className="text-xs font-bold uppercase text-muted">Level {level.level}</p>
                      <p className="mt-1 font-black">{formatTokens(level.amount)} DL</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="grid gap-4 rounded-lg border border-line bg-surface p-4">
                <div>
                  <h2 className="text-xl font-black">Referral link</h2>
                  <p className="text-sm text-muted">
                    Members registered through this link become part of your distributor network.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface-muted p-3 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{referralLink}</span>
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 font-extrabold text-white hover:bg-accent-dark"
                    onClick={copyReferral}
                    type="button"
                  >
                    <Copy className="size-4" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
                <h2 className="text-xl font-black">P2P activity</h2>
                <MiniRow label="Active sell offers" value={data.metrics.activeSellOffers} />
                <MiniRow label="Active buy requests" value={data.metrics.activeBuyRequests} />
                <MiniRow label="Completed sales" value={data.metrics.completedSales} />
              </div>
            </section>

            <a
              className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white no-underline hover:bg-accent-dark"
              href="/distributor/market"
            >
              Open token market <ArrowRight className="size-4" />
            </a>
          </>
        )}
      </div>
    </DistributorShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}

function MiniRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}
