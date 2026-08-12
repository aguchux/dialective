'use client';

import {
  normalizeErrorMessage,
  P2PDispute,
  P2PTrade,
  useListAdminP2PDisputesQuery,
  useListAdminP2PTradesQuery,
  useResolveP2PDisputeMutation,
} from '@/store/api';
import { AdminShell } from '@/components/admin/AdminShell';
import { useState } from 'react';

export default function AdminP2PPage() {
  const { data: trades = [], isLoading: tradesLoading } = useListAdminP2PTradesQuery();
  const { data: disputes = [], isLoading: disputesLoading } = useListAdminP2PDisputesQuery({ status: 'OPEN' });
  const [resolveDispute, { isLoading: resolving }] = useResolveP2PDisputeMutation();
  const [error, setError] = useState('');

  async function resolve(dispute: P2PDispute, winner: 'buyer' | 'seller') {
    setError('');
    try {
      await resolveDispute({ id: dispute.id, winner, resolutionNote: `Resolved to ${winner}` }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to resolve dispute'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-black">P2P Market</h1>
          <p className="mt-2 text-muted">Monitor escrow trades, cancellation states, and open disputes.</p>
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <section className="grid gap-3">
          <h2 className="text-xl font-black">Open disputes</h2>
          <div className="grid gap-3">
            {disputesLoading && <Panel>Loading disputes...</Panel>}
            {!disputesLoading && disputes.length === 0 && <Panel>No open disputes.</Panel>}
            {disputes.map((dispute) => (
              <Panel key={dispute.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{dispute.reason}</p>
                    <p className="text-sm text-muted">
                      {dispute.trade.tokenAmount} tokens · {Number(dispute.trade.fiatAmount).toLocaleString()} {dispute.trade.fiatCurrency}
                    </p>
                    <p className="mt-1 text-sm text-muted">Raised by {dispute.raisedBy.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:opacity-60" disabled={resolving} onClick={() => resolve(dispute, 'buyer')} type="button">
                      Release to buyer
                    </button>
                    <button className="min-h-10 rounded-lg border border-line px-3 font-extrabold disabled:opacity-60" disabled={resolving} onClick={() => resolve(dispute, 'seller')} type="button">
                      Refund seller
                    </button>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="text-xl font-black">Recent trades</h2>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {tradesLoading && <tr><td className="px-4 py-5" colSpan={6}>Loading trades...</td></tr>}
                {!tradesLoading && trades.length === 0 && <tr><td className="px-4 py-5" colSpan={6}>No P2P trades yet.</td></tr>}
                {trades.map((trade) => <TradeRow key={trade.id} trade={trade} />)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">{children}</div>;
}

function TradeRow({ trade }: { trade: P2PTrade }) {
  return (
    <tr className="border-t border-line">
      <td className="px-4 py-3 font-black">{trade.status}</td>
      <td className="px-4 py-3">{trade.offerType}</td>
      <td className="px-4 py-3">{trade.tokenAmount} tokens · {Number(trade.fiatAmount).toLocaleString()} {trade.fiatCurrency}</td>
      <td className="px-4 py-3">{trade.buyer.email}</td>
      <td className="px-4 py-3">{trade.seller.email}</td>
      <td className="px-4 py-3">{new Date(trade.paymentDeadlineAt).toLocaleString()}</td>
    </tr>
  );
}
