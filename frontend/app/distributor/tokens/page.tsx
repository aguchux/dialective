'use client';

import { WalletCards, Network } from 'lucide-react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { formatTokens } from '@/components/distributor/format';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useGetDistributorDashboardQuery, type DistributorAllocation } from '@/store/api';

export default function DistributorTokensPage() {
  const { data, isLoading } = useGetDistributorDashboardQuery();

  const columns: DataTableColumn<DistributorAllocation>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (a) => <span className="text-muted">{new Date(a.createdAt).toLocaleDateString()}</span>,
      sortValue: (a) => a.createdAt,
    },
    {
      key: 'tokenAmount',
      header: 'Amount',
      render: (a) => <span className="font-black text-ink">{formatTokens(a.tokenAmount)} DL</span>,
      sortValue: (a) => Number(a.tokenAmount),
    },
    {
      key: 'discountRate',
      header: 'Discount',
      render: (a) => <span className="text-muted">{(Number(a.discountRate) * 100).toFixed(2)}%</span>,
      sortValue: (a) => Number(a.discountRate),
    },
    {
      key: 'note',
      header: 'Note',
      render: (a) => <span className="text-muted">{a.note ?? '—'}</span>,
      sortValue: (a) => a.note ?? '',
    },
  ];

  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h1 className="text-3xl font-black">Tokens</h1>
          <p className="text-muted">Wallet balance and admin bulk allocation history.</p>
        </div>

        {isLoading && <p className="text-muted">Loading token data...</p>}

        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <Metric icon={WalletCards} label="Available DL" value={formatTokens(data.wallet.balance)} />
              <Metric icon={Network} label="Network DL balance" value={formatTokens(data.metrics.networkTokenBalance)} />
            </section>

            <div>
              <h2 className="mb-3 text-xl font-black">Bulk allocation history</h2>
              <DataTable
                columns={columns}
                rows={data.allocations}
                rowKey={(a) => a.id}
                emptyMessage="No admin allocation yet."
                searchPlaceholder="Search allocations..."
              />
            </div>
          </>
        )}
      </div>
    </DistributorShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon className="size-5" /></div>
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}
