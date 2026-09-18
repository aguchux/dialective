'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { TradeChatPanel } from '@/components/p2p/TradeChatPanel';
import { TradeDetail } from '@/components/p2p/TradeDetail';
import {
  normalizeErrorMessage,
  useGetMeQuery,
  useGetP2PTradeQuery,
  useMarkP2PTradePaidMutation,
  useReleaseP2PTradeMutation,
  useRequestP2PTradeCancelMutation,
} from '@/store/api';

/**
 * One trade's page -- shared by /dashboard/trades/[id] and
 * /distributor/trades/[id], each mounting it in its own chrome.
 *
 * The trade summary is the header and the conversation is the body: talking
 * is what most of a trade actually is, so the thread is the main content
 * rather than something behind a button. Raising a dispute is anchored here
 * too, always against the trade you are looking at.
 */
export function TradeDetailView({ tradeId }: { tradeId: string }) {
  const pathname = usePathname();
  const basePath = pathname?.startsWith('/distributor') ? '/distributor' : '/dashboard';
  // Set by the header's Raise-a-dispute button; the embedded conversation
  // owns the confirmation and the reason form.
  const [disputeRequestedAt, setDisputeRequestedAt] = useState(0);

  // Polls so a counterparty's action (marking paid, releasing) shows up
  // without a manual refresh -- the same cadence the list used.
  const { data: trade, isLoading, error } = useGetP2PTradeQuery(tradeId, {
    pollingInterval: 30_000,
  });
  const { data: me } = useGetMeQuery();
  const [markPaid, { isLoading: markingPaid }] = useMarkP2PTradePaidMutation();
  const [releaseTrade, { isLoading: releasing }] = useReleaseP2PTradeMutation();
  const [requestCancel, { isLoading: cancelling }] = useRequestP2PTradeCancelMutation();

  return (
    <div>
      <Link
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-extrabold text-muted hover:text-ink"
        href={`${basePath}/market-activity`}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to my market activity
      </Link>

      <h1 className="mt-3 mb-5 text-2xl font-black tracking-normal md:text-3xl">Trade</h1>

      {isLoading && (
        <div className="grid place-items-center gap-3 py-16 text-center">
          <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
          <p className="font-bold text-muted">Loading this trade...</p>
        </div>
      )}

      {!isLoading && Boolean(error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {normalizeErrorMessage(error, 'This trade could not be loaded.')}
        </div>
      )}

      {trade && (
        <div className="grid gap-4">
          <TradeDetail
            cancelling={cancelling}
            markingPaid={markingPaid}
            onCancel={(id) => requestCancel(id).unwrap()}
            onMarkPaid={(id) => markPaid(id).unwrap()}
            onRaiseDispute={() => setDisputeRequestedAt(Date.now())}
            onRelease={(id) => releaseTrade(id).unwrap()}
            releasing={releasing}
            trade={trade}
            viewerId={me?.id}
          />
          <div>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-muted">
              Conversation
            </h2>
            <TradeChatPanel
              disputeRequestedAt={disputeRequestedAt}
              embedded
              isViewerAdmin={false}
              trade={trade}
              viewerId={me?.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
