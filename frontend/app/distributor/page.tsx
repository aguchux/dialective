'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, Copy, Network, RefreshCw, Store, Users, WalletCards } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { MarketView } from '@/components/p2p/MarketView';
import { useGetDistributorDashboardQuery, type DistributorNetwork, type DistributorNetworkNode } from '@/store/api';
import { roleHomePath } from '@/lib/role-home';

function formatTokens(value: string | number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function DistributorDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isFetching, refetch } = useGetDistributorDashboardQuery(undefined, {
    skip: status !== 'authenticated' || session?.user.role !== 'DISTRIBUTOR',
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/distributor');
    if (status === 'authenticated' && session.user.role !== 'DISTRIBUTOR') {
      router.replace(roleHomePath(session.user.role, session.user.onboardingComplete));
    }
  }, [router, session, status]);

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

  if (status === 'loading' || status === 'authenticated' && session?.user.role !== 'DISTRIBUTOR') {
    return <main className="min-h-screen bg-[#0b0710] text-white" />;
  }

  return (
    <main className="min-h-screen bg-[#0b0710] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0710]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <BrandLogo href="/distributor" size={34} className="text-white" textClassName="font-black" />
          <div className="flex items-center gap-2">
            <a className="hidden min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-extrabold text-white no-underline hover:bg-white/10 sm:inline-flex" href="#market">
              P2P market <ArrowRight className="size-4" />
            </a>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-extrabold hover:bg-white/10" onClick={() => refetch()} type="button">
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
        {isLoading && <p className="text-white/70">Loading distributor dashboard...</p>}
        {data && (
          <>
            <section className="grid gap-5 border-b border-white/10 pb-6 md:grid-cols-[1fr_auto] md:items-end">
              <div className="grid gap-2">
                <p className="text-sm font-bold text-[#b989ff]">Distributor network</p>
                <h1 className="text-3xl font-black leading-tight sm:text-5xl">{data.profile.name}</h1>
                <p className="max-w-2xl text-white/65">
                  Broker DL tokens through P2P, direct network referrals, and configured multi-level commissions.
                </p>
              </div>
              <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#7b1ec9] px-4 font-extrabold text-white no-underline hover:bg-[#8e35dc]" href="#market">
                Open token market <ArrowRight className="size-4" />
              </a>
            </section>

            {!data.settings.enabled && (
              <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
                Distributor features are currently disabled by admin.
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric icon={WalletCards} label="Available DL" value={formatTokens(data.wallet.balance)} />
              <Metric icon={Users} label="Network members" value={data.metrics.networkMembers.toLocaleString()} />
              <Metric icon={Network} label="Network DL balance" value={formatTokens(data.metrics.networkTokenBalance)} />
              <Metric icon={Store} label="Referral bonuses" value={formatTokens(data.metrics.referralBonuses)} />
            </section>

            {data.referralBonusesByLevel.length > 0 && (
              <section className="grid gap-3 rounded-lg border border-white/10 bg-[#121018] p-4">
                <h2 className="text-xl font-black">Referral bonuses by level</h2>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {data.referralBonusesByLevel.map((level) => (
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3" key={level.level}>
                      <p className="text-xs font-bold uppercase text-white/45">Level {level.level}</p>
                      <p className="mt-1 font-black">{formatTokens(level.amount)} DL</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="grid gap-4 rounded-lg border border-white/10 bg-[#121018] p-4">
                <div>
                  <h2 className="text-xl font-black">Referral link</h2>
                  <p className="text-sm text-white/60">Members registered through this link become part of your distributor network.</p>
                </div>
                <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{referralLink}</span>
                  <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 font-extrabold text-[#151019]" onClick={copyReferral} type="button">
                    <Copy className="size-4" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-white/10 bg-[#121018] p-4">
                <h2 className="text-xl font-black">P2P activity</h2>
                <MiniRow label="Active sell offers" value={data.metrics.activeSellOffers} />
                <MiniRow label="Active buy requests" value={data.metrics.activeBuyRequests} />
                <MiniRow label="Completed sales" value={data.metrics.completedSales} />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <div className="grid content-start gap-3 rounded-lg border border-white/10 bg-[#121018] p-4">
                <h2 className="text-xl font-black">Recent bulk allocations</h2>
                {data.allocations.length === 0 && <p className="text-sm text-white/60">No admin allocation yet.</p>}
                {data.allocations.map((allocation) => (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3" key={allocation.id}>
                    <p className="font-black">{formatTokens(allocation.tokenAmount)} DL</p>
                    <p className="text-sm text-white/60">{(Number(allocation.discountRate) * 100).toFixed(2)}% discount</p>
                    {allocation.note && <p className="mt-1 text-sm text-white/70">{allocation.note}</p>}
                  </div>
                ))}
              </div>

              <NetworkPanel network={data.network} />
            </section>

            <section id="market" className="rounded-lg border border-white/10 bg-[#f7f1ff] p-3 text-[#12081d]">
              <MarketView />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-[#121018] p-4">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-[#7b1ec9]/20 text-[#b989ff]"><Icon className="size-5" /></div>
      <p className="text-sm font-bold text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}

function MiniRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between border-b border-white/10 pb-2 last:border-0 last:pb-0"><span className="text-white/65">{label}</span><span className="font-black">{value}</span></div>;
}

/**
 * Two views over the same data: "tree" (recursive expand/collapse per the
 * spec's "click on them to see their referrals") and "all" (flattened
 * allMembers list, per the spec's "or switch to see all"). Both come
 * straight off the dashboard response -- no extra request when toggling.
 */
function NetworkPanel({ network }: { network: DistributorNetwork }) {
  const [view, setView] = useState<'tree' | 'all'>('tree');

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-[#121018] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-black">Member network</h2>
          <p className="text-sm text-white/60">Names and token balances only, up to {network.maxDepth || 0} downline level{network.maxDepth === 1 ? '' : 's'}.</p>
        </div>
        <div className="inline-flex rounded-lg border border-white/15 p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-extrabold ${view === 'tree' ? 'bg-white text-[#151019]' : 'text-white/70'}`}
            onClick={() => setView('tree')}
            type="button"
          >
            By referral
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-extrabold ${view === 'all' ? 'bg-white text-[#151019]' : 'text-white/70'}`}
            onClick={() => setView('all')}
            type="button"
          >
            See all ({network.totalMembers})
          </button>
        </div>
      </div>

      {network.maxDepth === 0 && (
        <p className="rounded-lg border border-white/10 bg-black/20 p-6 text-center font-bold text-white/70">
          Multi-level referrals are currently disabled by admin.
        </p>
      )}

      {network.maxDepth > 0 && view === 'tree' && (
        network.tree.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-black/20 p-6 text-center font-bold text-white/70">No referred members yet.</p>
        ) : (
          <div className="grid gap-2">
            {network.tree.map((node) => <NetworkNodeView key={node.id} node={node} />)}
          </div>
        )
      )}

      {network.maxDepth > 0 && view === 'all' && (
        network.allMembers.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-black/20 p-6 text-center font-bold text-white/70">No referred members yet.</p>
        ) : (
          <div className="grid max-h-96 gap-2 overflow-y-auto">
            {network.allMembers.map((member) => (
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3" key={member.id}>
                <span>
                  <span className="block font-black">{member.name}</span>
                  <span className="text-xs font-bold uppercase text-white/45">Level {member.level}</span>
                </span>
                <span className="font-black">{formatTokens(member.tokenBalance)} DL</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function NetworkNodeView({ node }: { node: DistributorNetworkNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span>
          <span className="block font-black">{node.name}</span>
          <span className="text-xs font-bold uppercase text-white/45">Level {node.level}</span>
        </span>
        <span className="font-black">{formatTokens(node.tokenBalance)} DL</span>
      </button>
      {open && node.children.length > 0 && (
        <div className="mt-3 grid gap-2 border-l border-white/10 pl-3">
          {node.children.map((child) => <NetworkNodeView key={child.id} node={child} />)}
        </div>
      )}
    </div>
  );
}
