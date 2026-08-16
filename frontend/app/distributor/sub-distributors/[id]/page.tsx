'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { formatTokens } from '@/components/distributor/format';
import { activityLabels } from '@/components/trainer/TrainerDashboard';
import { DistributorActivityEntry, useGetSubDistributorActivityQuery, useListSubDistributorsQuery } from '@/store/api';

export default function SubDistributorActivityPage() {
  const params = useParams<{ id: string }>();
  const subDistributorId = params.id;
  const { data: subDistributors, isLoading: isLoadingSubDistributor } = useListSubDistributorsQuery();
  const subDistributor = subDistributors?.find((d) => d.id === subDistributorId);

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading } = useGetSubDistributorActivityQuery({ subDistributorId, page, pageSize });

  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Link className="text-sm font-bold text-accent hover:text-accent-dark" href="/distributor/sub-distributors">
            &larr; Sub-distributors
          </Link>
          <h1 className="text-3xl font-black">
            {isLoadingSubDistributor && !subDistributor ? 'Loading...' : subDistributor?.name ?? 'Sub-distributor activity'}
          </h1>
          {subDistributor && <p className="leading-relaxed text-muted">{subDistributor.email}</p>}
          <p className="leading-relaxed text-muted">
            Every transaction against this sub-distributor&rsquo;s wallet &mdash; bulk allocations, your credits and
            debits, and referral bonus fan-out.
          </p>
        </div>

        <div className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          {isLoading && <p className="text-muted">Loading...</p>}
          {!isLoading && (!data || data.items.length === 0) && <p className="text-sm text-muted">No transactions yet.</p>}
          {!isLoading && data && data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-96 text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-bold uppercase text-muted">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <ActivityRow entry={entry} key={entry.id} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-sm text-muted">
                Page {data.page} of {data.totalPages} &middot; {data.total} total
              </p>
              <div className="flex gap-2">
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DistributorShell>
  );
}

function ActivityRow({ entry }: { entry: DistributorActivityEntry }) {
  const isCredit = Number(entry.amount) >= 0;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2 pr-3 text-muted">{new Date(entry.createdAt).toLocaleString()}</td>
      <td className="py-2 pr-3 font-bold">{activityLabels[entry.type]}</td>
      <td className={`py-2 font-bold ${isCredit ? 'text-accent-dark' : 'text-danger'}`}>
        {isCredit ? '+' : ''}
        {formatTokens(entry.amount)} DL
      </td>
    </tr>
  );
}
