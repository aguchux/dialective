'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Clock3, Landmark, Plus } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { formatCompactNumber } from '@/lib/format';
import {
  Avatar,
  cardClass,
  EmptyPanel,
  formatDate,
  formatDateTime,
  SectionTitle,
} from '@/components/dashboard/shared';
import {
  P2POffer,
  P2PTrade,
  normalizeErrorMessage,
  useAcceptP2POfferMutation,
  useCreateP2POfferMutation,
  useGetMeQuery,
  useGetP2PPaymentMethodsQuery,
  useGetP2PReferenceRateQuery,
  useGetP2PSettingsQuery,
  useGetP2PTraderProfileQuery,
  useGetPlatformSettingsQuery,
  useListMyP2PTradesQuery,
  useListP2POffersQuery,
  useMarkP2PTradePaidMutation,
  useRaiseP2PDisputeMutation,
  useReleaseP2PTradeMutation,
  useRequestP2PTradeCancelMutation,
  useRequestP2PTradeOtpMutation,
} from '@/store/api';

/**
 * P2P escrow market view -- shared between the trainer dashboard's "Market"
 * tab and the distributor dashboard (distributors resell bulk-allocated DL
 * through this same market, see AGENTS.md-equivalent context in
 * app/distributor/page.tsx). Pulled out of TrainerDashboard.tsx so the
 * distributor bundle doesn't have to pull in that entire 2000+ line module
 * (word training, submissions, etc.) just to render this one panel.
 */
export function MarketView() {
  const [activeTab, setActiveTab] = useState<'SELL' | 'BUY' | 'TRADES'>('SELL');
  const [offerType, setOfferType] = useState<'SELL' | 'BUY'>('SELL');
  const [tokenAmount, setTokenAmount] = useState('10');
  const [fiatAmount, setFiatAmount] = useState('10000');
  const [fiatCurrency, setFiatCurrency] = useState('NGN');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const { data: settings } = useGetP2PSettingsQuery();
  const { data: referenceRate } = useGetP2PReferenceRateQuery();
  const { data: methods = [] } = useGetP2PPaymentMethodsQuery();
  const { data: sellOffers = [] } = useListP2POffersQuery({ type: 'SELL' });
  const { data: buyOffers = [] } = useListP2POffersQuery({ type: 'BUY' });
  const { data: trades = [] } = useListMyP2PTradesQuery();
  const { data: me } = useGetMeQuery();
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const [createOffer, { isLoading: offerSaving }] = useCreateP2POfferMutation();
  const [acceptOffer, { isLoading: accepting }] = useAcceptP2POfferMutation();
  const [requestTradeOtp, { isLoading: tradeOtpSending }] = useRequestP2PTradeOtpMutation();
  const [markPaid, { isLoading: markingPaid, originalArgs: markingPaidId }] =
    useMarkP2PTradePaidMutation();
  const [releaseTrade, { isLoading: releasing, originalArgs: releasingId }] =
    useReleaseP2PTradeMutation();
  const [requestCancel, { isLoading: cancelling, originalArgs: cancellingId }] =
    useRequestP2PTradeCancelMutation();
  const [raiseDispute, { isLoading: disputing, originalArgs: disputingArgs }] =
    useRaiseP2PDisputeMutation();
  const primaryMethod = methods.find((method) => method.enabled);
  const phoneVerificationRequired = platformSettings?.phoneVerificationRequired ?? true;
  const phoneVerified = me?.phoneVerified ?? false;
  // Trading is blocked on phone verification only while that requirement
  // is on -- when it's off, createOffer/acceptOffer fall back to an
  // emailed OTP instead (see submitOffer/accept and offerOtpRequestId below).
  const marketDisabled = !settings?.enabled || (phoneVerificationRequired && !phoneVerified);
  const [offerOtpRequestId, setOfferOtpRequestId] = useState<string | null>(null);
  const [offerOtpCode, setOfferOtpCode] = useState('');
  const [pendingAcceptOffer, setPendingAcceptOffer] = useState<P2POffer | null>(null);

  // Pre-fills the offer form's currency with the trainer's own country currency once known; the field stays editable.
  useEffect(() => {
    if (referenceRate?.currencyCode) setFiatCurrency(referenceRate.currencyCode);
  }, [referenceRate?.currencyCode]);

  function deriveFiatAmount(tokens: number): string | null {
    const rate = referenceRate?.tokenReferencePrice
      ? Number(referenceRate.tokenReferencePrice)
      : null;
    if (!rate || !Number.isFinite(tokens) || tokens <= 0) return null;
    return (tokens * rate).toFixed(2).replace(/\.00$/, '');
  }

  function updateTokenAmount(value: string) {
    setTokenAmount(value);
    const derived = deriveFiatAmount(Number(value));
    if (derived) setFiatAmount(derived);
  }

  // Re-derive the fiat amount from the current token amount whenever the dialog opens, so a stale
  // manual edit from a previous session doesn't linger once the reference rate is known.
  useEffect(() => {
    if (!createOpen) return;
    const derived = deriveFiatAmount(Number(tokenAmount));
    if (derived) setFiatAmount(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, referenceRate?.tokenReferencePrice]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (!phoneVerificationRequired && !offerOtpRequestId) {
        const otp = await requestTradeOtp({
          action: 'create-offer',
          type: offerType,
          tokenAmount: Number(tokenAmount),
          fiatAmount: Number(fiatAmount),
          fiatCurrency,
        }).unwrap();
        setOfferOtpRequestId(otp.otpRequestId);
        return;
      }
      await createOffer({
        type: offerType,
        tokenAmount: Number(tokenAmount),
        fiatAmount: Number(fiatAmount),
        fiatCurrency,
        paymentMethod: 'BANK_TRANSFER',
        paymentMethodId: offerType === 'SELL' ? primaryMethod?.id : undefined,
        ...(offerOtpRequestId
          ? { otpRequestId: offerOtpRequestId, code: offerOtpCode.trim() }
          : {}),
      }).unwrap();
      setCreateOpen(false);
      setActiveTab(offerType);
      setOfferOtpRequestId(null);
      setOfferOtpCode('');
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          offerOtpRequestId ? 'Could not verify this code' : 'Could not post market offer',
        ),
      );
    }
  }

  async function accept(offer: P2POffer) {
    setError('');
    if (!phoneVerificationRequired) {
      try {
        const otp = await requestTradeOtp({ action: 'accept-offer', offerId: offer.id }).unwrap();
        setOfferOtpRequestId(otp.otpRequestId);
        setOfferOtpCode('');
        setPendingAcceptOffer(offer);
      } catch (err) {
        setError(normalizeErrorMessage(err, 'Could not send verification code'));
      }
      return;
    }
    try {
      await acceptOffer({
        id: offer.id,
        sellerPaymentMethodId: offer.type === 'BUY' ? primaryMethod?.id : undefined,
      }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not accept offer'));
    }
  }

  async function confirmAcceptOffer() {
    if (!pendingAcceptOffer || !offerOtpRequestId) return;
    setError('');
    try {
      await acceptOffer({
        id: pendingAcceptOffer.id,
        sellerPaymentMethodId: pendingAcceptOffer.type === 'BUY' ? primaryMethod?.id : undefined,
        otpRequestId: offerOtpRequestId,
        code: offerOtpCode.trim(),
      }).unwrap();
      setPendingAcceptOffer(null);
      setOfferOtpRequestId(null);
      setOfferOtpCode('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not verify this code'));
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-normal md:text-3xl">DL market</h1>
          <p className="mt-1 text-muted">
            Peer-to-peer DL escrow for sell offers and buy requests.
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) {
              setOfferOtpRequestId(null);
              setOfferOtpCode('');
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={marketDisabled}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
              Create request
            </button>
          </DialogTrigger>
          <DialogContent
            title="Create market request"
            description="Post a sell offer or a buy request. Trades use escrow until payment is confirmed."
          >
            <form className="grid gap-3" onSubmit={submitOffer}>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-bg p-1">
                {(['SELL', 'BUY'] as const).map((type) => (
                  <button
                    className={`min-h-10 rounded-md font-extrabold ${offerType === type ? 'bg-accent text-white' : 'text-muted hover:bg-surface'}`}
                    key={type}
                    onClick={() => setOfferType(type)}
                    type="button"
                  >
                    {type === 'SELL' ? 'Sell DL' : 'Buy request'}
                  </button>
                ))}
              </div>
              <label className="grid gap-1.5 text-sm font-bold">
                DL amount
                <input
                  className="min-h-11 rounded-lg border border-line bg-bg px-3"
                  min="0"
                  onChange={(e) => updateTokenAmount(e.target.value)}
                  type="number"
                  value={tokenAmount}
                />
              </label>
              {referenceRate?.tokenReferencePrice && referenceRate.currencyCode && (
                <p className="text-xs text-muted">
                  Reference: 1 DL ≈ {Number(referenceRate.tokenReferencePrice).toLocaleString()}{' '}
                  {referenceRate.currencyCode} — you can price above or below this.
                </p>
              )}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label className="grid gap-1.5 text-sm font-bold">
                  Fiat amount
                  <input
                    className="min-h-11 rounded-lg border border-line bg-bg px-3"
                    min="0"
                    onChange={(e) => setFiatAmount(e.target.value)}
                    step="0.01"
                    type="number"
                    value={fiatAmount}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  Currency
                  <input
                    className="min-h-11 w-20 rounded-lg border border-line bg-bg px-2 text-center uppercase"
                    maxLength={3}
                    onChange={(e) => setFiatCurrency(e.target.value.toUpperCase())}
                    value={fiatCurrency}
                  />
                </label>
              </div>
              {offerType === 'SELL' && !primaryMethod && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Add your bank details in Profile before posting a sell offer.
                </p>
              )}
              {!phoneVerificationRequired && offerOtpRequestId && (
                <label className="grid gap-1.5 text-sm font-bold">
                  Email verification code
                  <input
                    className="min-h-11 rounded-lg border border-line bg-bg px-3"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(e) => setOfferOtpCode(e.target.value)}
                    value={offerOtpCode}
                  />
                </label>
              )}
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  marketDisabled ||
                  (offerType === 'SELL' && !primaryMethod) ||
                  (Boolean(offerOtpRequestId) && !offerOtpCode.trim())
                }
                pending={offerSaving || tradeOtpSending}
                pendingLabel={
                  offerOtpRequestId
                    ? 'Posting'
                    : !phoneVerificationRequired
                      ? 'Sending code'
                      : 'Posting'
                }
                type="submit"
              >
                {offerOtpRequestId
                  ? 'Confirm'
                  : !phoneVerificationRequired
                    ? 'Send confirmation code'
                    : offerType === 'SELL'
                      ? 'Post sell offer'
                      : 'Post buy request'}
              </ActionButton>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}
      {!settings?.enabled && (
        <div className={`${cardClass} mb-5 p-5`}>
          <p className="font-black">P2P market is currently disabled.</p>
          <p className="mt-1 text-sm text-muted">
            Admin must enable marketplace settings before trades can start.
          </p>
        </div>
      )}
      {settings?.enabled && phoneVerificationRequired && !phoneVerified && (
        <div className={`${cardClass} mb-5 p-5`}>
          <p className="font-black">Verify your phone number to trade.</p>
          <p className="mt-1 text-sm text-muted">
            Add and verify a phone number in Profile before buying or selling on the P2P market.
          </p>
        </div>
      )}

      <section>
        <div className="mb-5 flex w-fit max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1">
          {[
            { id: 'SELL', label: 'Sell offers', count: sellOffers.length },
            { id: 'BUY', label: 'Buy requests', count: buyOffers.length },
            { id: 'TRADES', label: 'My trades', count: trades.length },
          ].map((tab) => (
            <button
              className={`min-h-10 whitespace-nowrap rounded-md px-4 text-sm font-extrabold ${activeTab === tab.id ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted'}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'SELL' | 'BUY' | 'TRADES')}
              type="button"
            >
              {tab.label} <span className="ml-1 opacity-80">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-5">
          {activeTab === 'SELL' && (
            <MarketOfferList
              accepting={accepting}
              disabled={marketDisabled}
              offers={sellOffers}
              onAccept={accept}
              title="Sell offers"
            />
          )}
          {activeTab === 'BUY' && (
            <MarketOfferList
              accepting={accepting}
              disabled={marketDisabled}
              offers={buyOffers}
              onAccept={accept}
              title="Buy requests"
            />
          )}
          {activeTab === 'TRADES' && (
            <section>
              <SectionTitle
                title="My trades"
                subtitle="Pay, release, cancel safely, or raise disputes."
              />
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
                    disputing={disputing && disputingArgs?.id === trade.id}
                    onCancel={(id) => requestCancel(id).unwrap()}
                    onDispute={(id) =>
                      raiseDispute({
                        id,
                        reason: 'Payment/escrow issue requires admin review',
                      }).unwrap()
                    }
                    onMarkPaid={(id) => markPaid(id).unwrap()}
                    onRelease={(id) => releaseTrade(id).unwrap()}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </section>

      {pendingAcceptOffer && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPendingAcceptOffer(null);
              setOfferOtpRequestId(null);
              setOfferOtpCode('');
            }
          }}
        >
          <DialogContent
            title="Confirm this trade"
            description="We emailed a 6-digit code to confirm this trade."
          >
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-bold">
                Email verification code
                <input
                  autoFocus
                  className="min-h-11 rounded-lg border border-line bg-bg px-3"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setOfferOtpCode(e.target.value)}
                  value={offerOtpCode}
                />
              </label>
              {error && <p className="text-sm font-bold text-danger">{error}</p>}
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!offerOtpCode.trim()}
                onClick={() => void confirmAcceptOffer()}
                pending={accepting}
                pendingLabel="Confirming"
                type="button"
              >
                Confirm
              </ActionButton>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MarketOfferList({
  title,
  offers,
  onAccept,
  accepting,
  disabled,
}: {
  title: string;
  offers: P2POffer[];
  onAccept: (offer: P2POffer) => void;
  accepting: boolean;
  disabled: boolean;
}) {
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  return (
    <section>
      <SectionTitle title={title} subtitle="Active marketplace posts." />
      <div className="grid gap-3 md:grid-cols-2">
        {offers.length === 0 && <EmptyPanel icon={Landmark} title="No active posts" unframed />}
        {offers.map((offer) => (
          <div className={`${cardClass} grid gap-3 p-4`} key={offer.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-muted">
                  {offer.type === 'SELL' ? 'Selling' : 'Buying'}
                </p>
                <p className="text-2xl font-black">{formatCompactNumber(offer.tokenAmount)}</p>
              </div>
              <p className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
                {offer.status}
              </p>
            </div>
            {offer.user && (
              <button
                className="flex items-center gap-2 justify-self-start rounded-lg text-left hover:opacity-80"
                onClick={() => setProfileUserId(offer.userId)}
                type="button"
              >
                <Avatar email={offer.user.email} />
                <span className="text-sm font-bold">{traderDisplayName(offer.user)}</span>
              </button>
            )}
            <p className="font-extrabold">
              {Number(offer.fiatAmount).toLocaleString()} {offer.fiatCurrency}
            </p>
            <p className="text-sm text-muted">Expires {formatDateTime(offer.expiresAt)}</p>
            <button
              className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white disabled:opacity-50"
              disabled={accepting || disabled}
              onClick={() => onAccept(offer)}
              type="button"
            >
              {offer.type === 'SELL' ? 'Buy DL' : 'Sell to buyer'}
            </button>
          </div>
        ))}
      </div>
      <TraderProfileDialog
        onOpenChange={(open) => !open && setProfileUserId(null)}
        userId={profileUserId}
      />
    </section>
  );
}

function traderDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}

function TraderProfileDialog({
  userId,
  onOpenChange,
}: {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    data: profile,
    isLoading,
    error,
  } = useGetP2PTraderProfileQuery(userId ?? '', { skip: !userId });
  return (
    <Dialog open={userId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title="Trader profile"
        description="Basic info shown to other traders in the market."
      >
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {!isLoading && Boolean(error) && (
          <p className="text-sm text-danger">
            {normalizeErrorMessage(error, 'Could not load this trader profile')}
          </p>
        )}
        {profile && (
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <Avatar email={profile.firstName ?? profile.id} large />
              <div>
                <p className="text-lg font-black">
                  {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Trainer'}
                </p>
                <p className="text-sm text-muted">Member since {formatDate(profile.memberSince)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line bg-bg p-3">
                <p className="text-xs font-bold text-muted">Completed sales</p>
                <p className="text-xl font-black">{profile.completedSaleCount}</p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <p className="text-xs font-bold text-muted">Avg. release time</p>
                <p className="text-xl font-black">
                  {formatResponseTime(profile.avgReleaseSeconds)}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatResponseTime(seconds: number | null) {
  if (seconds === null) return 'No data yet';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
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
  disputing,
  onMarkPaid,
  onRelease,
  onCancel,
  onDispute,
}: {
  trade: P2PTrade;
  viewerId: string | undefined;
  markingPaid: boolean;
  releasing: boolean;
  cancelling: boolean;
  disputing: boolean;
  onMarkPaid: (id: string) => Promise<unknown>;
  onRelease: (id: string) => Promise<unknown>;
  onCancel: (id: string) => Promise<unknown>;
  onDispute: (id: string) => Promise<unknown>;
}) {
  const [actionError, setActionError] = useState('');
  const isBuyer = trade.buyerId === viewerId;
  const isSeller = trade.sellerId === viewerId;
  const isOpen = OPEN_TRADE_STATUSES.has(trade.status);

  const canMarkPaid =
    isBuyer && (trade.status === 'AWAITING_PAYMENT' || trade.status === 'CANCEL_PENDING');
  const canRelease = isSeller && trade.status === 'PAID_MARKED';
  const canRequestCancel = isOpen && trade.status !== 'PAID_MARKED';
  const canDispute = isOpen;

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
      {trade.sellerPaymentMethod && (
        <div className="rounded-lg border border-line bg-bg p-3 text-sm">
          <p className="font-black">Seller payment details</p>
          <p>
            {trade.sellerPaymentMethod.bankName} · {trade.sellerPaymentMethod.accountName} ·{' '}
            {trade.sellerPaymentMethod.accountNumber}
          </p>
          {trade.sellerPaymentInstructions && (
            <p className="mt-1 text-muted">{trade.sellerPaymentInstructions}</p>
          )}
        </div>
      )}
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
        {canDispute && (
          <ActionButton
            className="min-h-10 rounded-lg border border-red-200 px-3 font-extrabold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(onDispute)}
            pending={disputing}
            pendingLabel="Raising"
            type="button"
          >
            Dispute
          </ActionButton>
        )}
        {!canMarkPaid && !canRelease && !canRequestCancel && !canDispute && (
          <p className="text-sm text-muted">
            No actions available -- this trade is {STATUS_LABELS[trade.status].toLowerCase()}.
          </p>
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
