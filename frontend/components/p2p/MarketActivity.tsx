'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock3, Landmark, Phone } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, EmptyPanel, formatDateTime, SectionTitle } from '@/components/dashboard/shared';
import { PaymentCountdown } from '@/components/p2p/PaymentCountdown';
import { STATUS_LABELS, statusBadgeClass } from '@/components/p2p/tradeStatus';
import { formatCompactNumber } from '@/lib/format';
import {
  P2POffer,
  P2PTrade,
  normalizeErrorMessage,
  useCancelP2POfferMutation,
  useGetMeQuery,
  useListMyP2PTradesQuery,
  useListMyP2POffersQuery,
} from '@/store/api';

/**
 * My posts + My trades management -- shared content for both
 * /dashboard/market-activity (trainer) and /distributor/market-activity
 * (distributor), each of which mounts this inside its own page chrome
 * (DashboardHeader vs. DistributorShell). Split out of MarketView.tsx,
 * which is now just the browsable market list + create-offer flow.
 */
export function MarketActivity() {
  const [tab, setTab] = useState<'POSTS' | 'TRADES'>('TRADES');
  const [error, setError] = useState('');
  const pathname = usePathname();
  const basePath = pathname?.startsWith('/distributor') ? '/distributor' : '/dashboard';

  const { data: myOffers = [] } = useListMyP2POffersQuery();
  // Reads trigger the server-side expiry sweep, so a pending cancellation is
  // finalized shortly after its grace window ends without user intervention.
  const { data: trades = [] } = useListMyP2PTradesQuery(undefined, {
    pollingInterval: 30_000,
  });
  const { data: me } = useGetMeQuery();
  const [cancelOffer, { isLoading: cancellingOffer, originalArgs: cancellingOfferId }] =
    useCancelP2POfferMutation();

  async function cancelPost(offer: P2POffer) {
    if (
      !window.confirm(
        'Cancel this post? Any tokens locked for an active sell offer will be returned to your wallet.',
      )
    ) {
      return;
    }
    setError('');
    try {
      await cancelOffer(offer.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not cancel this post'));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-normal md:text-3xl">My market activity</h1>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 mb-5 flex w-fit max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1">
        {[
          { id: 'TRADES' as const, label: 'My trades', count: trades.length },
          { id: 'POSTS' as const, label: 'My posts', count: myOffers.length },
        ].map((option) => (
          <button
            className={`min-h-10 whitespace-nowrap rounded-md px-4 text-sm font-extrabold ${tab === option.id ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted'}`}
            key={option.id}
            onClick={() => setTab(option.id)}
            type="button"
          >
            {option.label} <span className="ml-1 opacity-80">{option.count}</span>
          </button>
        ))}
      </div>

      {tab === 'POSTS' && (
        <MyOfferList
          offers={myOffers}
          cancellingOffer={cancellingOffer}
          cancellingOfferId={cancellingOfferId}
          onCancel={cancelPost}
        />
      )}
      {tab === 'TRADES' && (
        <MyTradeTable basePath={basePath} trades={trades} viewerId={me?.id} />
      )}
    </div>
  );
}

/**
 * My trades as a scannable table, mirroring the market list's shape, with a
 * View CTA per row instead of every trade's full payment detail inline.
 *
 * The old card list rendered account numbers, copy buttons and action
 * buttons for every trade at once, which made a nine-trade history an
 * enormous wall and put "Release DL" one stray tap away while scrolling.
 * Acting on a trade now happens on its own page, where the trade you are
 * acting on is unambiguous.
 */
function MyTradeTable({
  basePath,
  trades,
  viewerId,
}: {
  basePath: string;
  trades: P2PTrade[];
  viewerId: string | undefined;
}) {
  return (
    <section>
      <SectionTitle
        title="My trades"
        subtitle="Open a trade to pay, release, cancel safely, or raise a dispute."
      />
      {trades.length === 0 ? (
        <EmptyPanel icon={Clock3} title="No trades yet" unframed />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-215 border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-bold" scope="col">
                  Counterparty
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Amount
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Role
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-bold" scope="col">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const isBuyer = trade.buyerId === viewerId;
                const isSeller = trade.sellerId === viewerId;
                const otherParty = isBuyer ? trade.seller : trade.buyer;
                const counterpartyName =
                  [otherParty.firstName, otherParty.lastName].filter(Boolean).join(' ') ||
                  'Unknown trader';
                return (
                  <tr
                    className="border-b border-line last:border-0 hover:bg-surface-muted"
                    key={trade.id}
                  >
                    <td className="px-4 py-3 align-top">
                      <p className="font-bold text-ink">{counterpartyName}</p>
                      {otherParty.phoneNumber && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                          <Phone className="size-3" aria-hidden="true" />
                          {otherParty.phoneNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-black text-ink">
                        {formatCompactNumber(trade.tokenAmount)} DL
                      </p>
                      <p className="text-xs text-muted">
                        {Number(trade.fiatAmount).toLocaleString()} {trade.fiatCurrency}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-bold text-ink">{isBuyer ? 'Buyer' : 'Seller'}</p>
                      <p className="text-xs text-muted">{formatDateTime(trade.updatedAt)}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(trade.status)}`}
                      >
                        {STATUS_LABELS[trade.status]}
                      </span>
                      {trade.status === 'AWAITING_PAYMENT' && (
                        <p className="mt-1">
                          <PaymentCountdown
                            compact
                            deadline={trade.paymentDeadlineAt}
                            isSeller={isSeller}
                          />
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {/* Labelled and coloured by the side the viewer is on,
                          matching the market list, so the trade path reads
                          the same end to end: green for selling, the
                          standard accent for buying. */}
                      <Link
                        className={`inline-flex min-h-9 items-center rounded-lg px-4 text-sm font-extrabold text-white ${
                          isBuyer
                            ? 'bg-accent hover:bg-accent-dark'
                            : 'bg-emerald-700 hover:bg-emerald-800'
                        }`}
                        href={`${basePath}/trades/${trade.id}`}
                      >
                        {isBuyer ? 'Buy' : 'Sell'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MyOfferList({
  offers,
  cancellingOffer,
  cancellingOfferId,
  onCancel,
}: {
  offers: P2POffer[];
  cancellingOffer: boolean;
  cancellingOfferId: string | undefined;
  onCancel: (offer: P2POffer) => void;
}) {
  return (
    <section>
      <SectionTitle
        title="My posts"
        subtitle="Active, completed, expired, and cancelled posts are retained for your account history."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {offers.length === 0 && <EmptyPanel icon={Landmark} title="No posts yet" unframed />}
        {offers.map((offer) => (
          <div className={`${cardClass} grid gap-3 p-4`} key={offer.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-muted">
                  {offer.type === 'SELL' ? 'Sell offer' : 'Buy request'}
                </p>
                <p className="text-2xl font-black">{formatCompactNumber(offer.tokenAmount)} DL</p>
              </div>
              <OfferStatusBadge status={offer.status} />
            </div>
            <p className="font-extrabold">
              {Number(offer.fiatAmount).toLocaleString()} {offer.fiatCurrency}
            </p>
            <OfferHistoryMessage offer={offer} />
            {offer.status === 'ACTIVE' && (
              <ActionButton
                className="min-h-10 rounded-lg border border-line px-3 font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onCancel(offer)}
                pending={cancellingOffer && cancellingOfferId === offer.id}
                pendingLabel="Cancelling"
                type="button"
              >
                Cancel post
              </ActionButton>
            )}
            {offer.status === 'RESERVED' && (
              <p className="text-sm font-bold text-muted">
                Accepted by another trader. The cancellation grace window is available in My trades.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function OfferHistoryMessage({ offer }: { offer: P2POffer }) {
  if (offer.status === 'CANCELLED' && offer.cancelledAt) {
    return <p className="text-sm text-muted">Cancelled {formatDateTime(offer.cancelledAt)}.</p>;
  }
  if (offer.status === 'COMPLETED' && offer.completedAt) {
    return <p className="text-sm text-muted">Completed {formatDateTime(offer.completedAt)}.</p>;
  }
  if (offer.status === 'EXPIRED')
    return <p className="text-sm text-muted">Expired without a trade.</p>;
  return <p className="text-sm text-muted">Expires {formatDateTime(offer.expiresAt)}.</p>;
}

function OfferStatusBadge({ status }: { status: P2POffer['status'] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black ${offerStatusBadgeClass(status)}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function offerStatusBadgeClass(status: P2POffer['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'bg-bg text-muted';
    case 'DISPUTED':
      return 'bg-red-100 text-red-700';
    case 'RESERVED':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-accent-soft text-accent';
  }
}
