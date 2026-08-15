'use client';

import { useState } from 'react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { formatTokens } from '@/components/distributor/format';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useGetDistributorNetworkQuery, type DistributorNetworkNode } from '@/store/api';

type FlatMember = Omit<DistributorNetworkNode, 'children'>;

export default function DistributorNetworkPage() {
  const { data: network, isLoading } = useGetDistributorNetworkQuery();
  const [view, setView] = useState<'tree' | 'all'>('tree');

  const columns: DataTableColumn<FlatMember>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (m) => <span className="font-black text-ink">{m.name}</span>,
      sortValue: (m) => m.name,
    },
    {
      key: 'level',
      header: 'Level',
      render: (m) => <span className="text-muted">Level {m.level}</span>,
      sortValue: (m) => m.level,
    },
    {
      key: 'tokenBalance',
      header: 'DL balance',
      render: (m) => <span className="font-black text-ink">{formatTokens(m.tokenBalance)} DL</span>,
      sortValue: (m) => Number(m.tokenBalance),
    },
  ];

  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h1 className="text-3xl font-black">Network</h1>
          <p className="text-white/65">
            Names and DL balances of your referred members, up to {network?.maxDepth ?? 0} downline level
            {network?.maxDepth === 1 ? '' : 's'}.
          </p>
        </div>

        {isLoading && <p className="text-white/70">Loading network...</p>}

        {network && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Metric label="Direct referrals" value={network.directMembers.toLocaleString()} />
              <Metric label="Total members" value={network.totalMembers.toLocaleString()} />
              <Metric label="Total DL balance" value={`${formatTokens(network.totalTokenBalance)} DL`} />
            </section>

            {network.maxDepth === 0 && (
              <p className="rounded-lg border border-white/10 bg-black/20 p-6 text-center font-bold text-white/70">
                Multi-level referrals are currently disabled by admin.
              </p>
            )}

            {network.maxDepth > 0 && (
              <>
                <div className="inline-flex w-fit rounded-lg border border-white/15 p-1">
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

                {view === 'tree' &&
                  (network.tree.length === 0 ? (
                    <p className="rounded-lg border border-white/10 bg-black/20 p-6 text-center font-bold text-white/70">No referred members yet.</p>
                  ) : (
                    <div className="grid gap-2 rounded-lg border border-white/10 bg-[#121018] p-4">
                      {network.tree.map((node) => (
                        <NetworkNodeView key={node.id} node={node} />
                      ))}
                    </div>
                  ))}

                {view === 'all' && (
                  <DataTable
                    columns={columns}
                    rows={network.allMembers}
                    rowKey={(m) => m.id}
                    emptyMessage="No referred members yet."
                    searchPlaceholder="Search members..."
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </DistributorShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-[#121018] p-4">
      <p className="text-sm font-bold text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
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
          {node.children.map((child) => (
            <NetworkNodeView key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}
