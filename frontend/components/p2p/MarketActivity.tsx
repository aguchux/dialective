'use client';

import { useState } from 'react';
import { Check, Clock3, Copy, Landmark, MessageSquare } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, EmptyPanel, formatDateTime, SectionTitle } from '@/components/dashboard/shared';
import { WhatsAppContactLink } from '@/components/WhatsAppContactLink';
import { TradeChatPanel } from '@/components/p2p/TradeChatPanel';
import { formatCompactNumber } from '@/lib/format';
import {
  P2POffer,
  P2PTrade,
  normalizeErrorMessage,
  useCancelP2POfferMutation,
  useGetMeQuery,
  useListMyP2PTradesQuery,
  useListMyP2POffersQuery,
  useMarkP2PTradePaidMutation,
  useReleaseP2PTradeMutation,
  useRequestP2PTradeCancelMutation,
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

  const { data: myOffers = [] } = useListMyP2POffersQuery();
  // Reads trigger the server-side expiry sweep, so a pending cancellation is
  // finalized shortly after its grace window ends without user intervention.
  const { data: trades = [] } = useListMyP2PTradesQuery(undefined, {
    pollingInterval: 30_000,
  });
  const { data: me } = useGetMeQuery();
  const [cancelOffer, { isLoading: cancellingOffer, originalArgs: cancellingOfferId }] =
    useCancelP2POfferMutation();
  const [markPaid, { isLoading: markingPaid, originalArgs: markingPaidId }] =
    useMarkP2PTradePaidMutation();
  const [releaseTrade, { isLoading: releasing, originalArgs: releasingId }] =
    useReleaseP2PTradeMutation();
  const [requestCancel, { isLoading: cancelling, originalArgs: cancellingId }] =
    useRequestP2PTradeCancelMutation();
  const [chatTradeId, setChatTradeId] = useState<string | null>(null);

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
        <section>
          <SectionTitle title="My trades" subtitle="Pay, release, cancel safely, or raise disputes." />
          <div className="grid gap-3">
            {trades.length === 0 && <EmptyPanel icon={Clock3} title="No trades yet" unframed />}
            {trades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                viewerId={me?.id}
                markingPaid={markingPaid && markingPaidId === trade.id}
                releasing={releasing && releasingId === trade.id}
                cancelling={cancelling && cancellingId === trade.id}
                onCancel={(id) => requestCancel(id).unwrap()}
                onMarkPaid={(id) => markPaid(id).unwrap()}
                onRelease={(id) => releaseTrade(id).unwrap()}
                onOpenChat={(id) => setChatTradeId(id)}
              />
            ))}
          </div>
        </section>
      )}
      {chatTradeId &&
        (() => {
          const trade = trades.find((item) => item.id === chatTradeId);
          if (!trade) return null;
          return (
            <TradeChatPanel
              isViewerAdmin={false}
              onClose={() => setChatTradeId(null)}
              trade={trade}
              viewerId={me?.id}
            />
          );
        })()}
    </div>
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

const STATUS_LABELS: Record<P2PTrade['status'], string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID_MARKED: 'Marked as paid',
  RELEASED: 'Released',
  CANCEL_PENDING: 'Cancel pending',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
  EXPIRED: 'Expired',
};

const OPEN_TRADE_STATUSES = new Set(['AWAITING_PAYMENT', 'PAID_MARKED', 'CANCEL_PENDING']);

function TradeCard({
  trade,
  viewerId,
  markingPaid,
  releasing,
  cancelling,
  onMarkPaid,
  onRelease,
  onCancel,
  onOpenChat,
}: {
  trade: P2PTrade;
  viewerId: string | undefined;
  markingPaid: boolean;
  releasing: boolean;
  cancelling: boolean;
  onMarkPaid: (id: string) => Promise<unknown>;
  onRelease: (id: string) => Promise<unknown>;
  onCancel: (id: string) => Promise<unknown>;
  onOpenChat: (id: string) => void;
}) {
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const isBuyer = trade.buyerId === viewerId;
  const isSeller = trade.sellerId === viewerId;
  const isOpen = OPEN_TRADE_STATUSES.has(trade.status);

  const canMarkPaid =
    isBuyer && (trade.status === 'AWAITING_PAYMENT' || trade.status === 'CANCEL_PENDING');
  const canRelease = isSeller && trade.status === 'PAID_MARKED';
  const canRequestCancel = isOpen && trade.status !== 'PAID_MARKED';

  async function run(action: (id: string) => Promise<unknown>) {
    setActionError('');
    try {
      await action(trade.id);
    } catch (err) {
      setActionError(normalizeErrorMessage(err, 'Action failed'));
    }
  }

  return (
    <div className={`${cardClass} grid gap-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-muted">
            {trade.offerType === 'SELL' ? 'Sell offer trade' : 'Buy request trade'} · You are the{' '}
            {isBuyer ? 'buyer' : 'seller'}
          </p>
          <p className="text-xl font-black">
            {formatCompactNumber(trade.tokenAmount)} · {Number(trade.fiatAmount).toLocaleString()}{' '}
            {trade.fiatCurrency}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(trade.status)}`}
        >
          {STATUS_LABELS[trade.status]}
        </span>
      </div>
      {(() => {
        const otherParty = isBuyer ? trade.seller : trade.buyer;
        return otherParty.phoneNumber ? (
          <WhatsAppContactLink
            className="text-sm font-bold"
            firstName={otherParty.firstName}
            lastName={otherParty.lastName}
            phoneNumber={otherParty.phoneNumber}
          />
        ) : (
          <p className="text-sm text-muted">
            {isBuyer ? 'Seller' : 'Buyer'} hasn&rsquo;t added a phone number yet.
          </p>
        );
      })()}
      {trade.sellerPaymentMethod &&
        (() => {
          const method = trade.sellerPaymentMethod;
          const isBank = method.type === 'BANK';
          // Real number when decryption succeeded (the normal case); falls
          // back to the masked column only if it didn't -- see
          // P2PSellerPaymentMethod's doc comment.
          const number = isBank
            ? (method.accountNumber ?? method.accountNumberMasked)
            : (method.mobileMoneyNumber ?? method.mobileMoneyNumberMasked);

          function handleCopy() {
            if (!number) return;
            void navigator.clipboard.writeText(number).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }

          return (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm">
              <p className="font-black">Seller payment details -- pay this account</p>
              <p className="mt-1">
                {isBank ? (method.bankName ?? method.bankCode) : method.mobileMoneyNetwork}
                {method.accountName && <> · {method.accountName}</>}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-base font-black tracking-wide">{number}</span>
                {number && (
                  <button
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-bold text-ink hover:bg-surface-muted"
                    onClick={handleCopy}
                    type="button"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-emerald-600" aria-hidden="true" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" aria-hidden="true" /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              {trade.sellerPaymentInstructions && (
                <p className="mt-1 text-muted">{trade.sellerPaymentInstructions}</p>
              )}
            </div>
          );
        })()}
      {trade.status === 'AWAITING_PAYMENT' && (
        <p className="text-sm text-muted">
          Payment deadline: {formatDateTime(trade.paymentDeadlineAt)}
        </p>
      )}
      {trade.status === 'PAID_MARKED' && trade.paidAt && (
        <p className="text-sm text-muted">
          Buyer marked paid {formatDateTime(trade.paidAt)}
          {isSeller
            ? ' — confirm and release when you have received payment.'
            : ' — waiting for the seller to release.'}
        </p>
      )}
      {trade.status === 'RELEASED' && trade.releasedAt && (
        <p className="text-sm text-muted">Released {formatDateTime(trade.releasedAt)}.</p>
      )}
      {trade.status === 'CANCELLED' && trade.cancelledAt && (
        <p className="text-sm text-muted">Cancelled {formatDateTime(trade.cancelledAt)}.</p>
      )}
      {trade.status === 'CANCEL_PENDING' && trade.cancelAvailableAt && (
        <p className="text-sm text-muted">
          {trade.cancelRequestedByUserId === viewerId
            ? 'You requested'
            : 'The other party requested'}{' '}
          cancellation — finalizes {formatDateTime(trade.cancelAvailableAt)} unless the buyer pays
          first.
        </p>
      )}
      {trade.status === 'DISPUTED' && (
        <p className="text-sm text-muted">An admin is reviewing this trade.</p>
      )}
      {actionError && <p className="text-sm font-bold text-danger">{actionError}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-extrabold hover:bg-surface-muted"
          onClick={() => onOpenChat(trade.id)}
          type="button"
        >
          <MessageSquare className="size-4" aria-hidden="true" /> Conversation
        </button>
        {canMarkPaid && (
          <ActionButton
            className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onMarkPaid)}
            pending={markingPaid}
            pendingLabel="Marking paid"
            type="button"
          >
            I have paid
          </ActionButton>
        )}
        {canRelease && (
          <ActionButton
            className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onRelease)}
            pending={releasing}
            pendingLabel="Releasing"
            type="button"
          >
            Release DL
          </ActionButton>
        )}
        {canRequestCancel && (
          <ActionButton
            className="min-h-10 rounded-lg border border-line px-3 font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onCancel)}
            pending={cancelling}
            pendingLabel="Requesting"
            type="button"
          >
            Request cancel
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function statusBadgeClass(status: P2PTrade['status']): string {
  switch (status) {
    case 'RELEASED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'bg-bg text-muted';
    case 'DISPUTED':
      return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200';
    case 'PAID_MARKED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    default:
      return 'bg-accent-soft text-accent';
  }
}
