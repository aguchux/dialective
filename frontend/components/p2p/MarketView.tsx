'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { Avatar, cardClass, formatDate } from '@/components/dashboard/shared';
import { MarketOfferList } from '@/components/p2p/MarketOfferList';
import { AcceptOfferDialogs } from '@/components/p2p/AcceptOfferDialogs';
import { useAcceptOffer } from '@/components/p2p/useAcceptOffer';
import {
  P2POffer,
  normalizeErrorMessage,
  useLazyGetP2POfferQuery,
  useCancelP2POfferMutation,
  useCreateP2POfferMutation,
  useGetMeQuery,
  useGetP2PReferenceRateQuery,
  useGetP2PSettingsQuery,
  useGetP2PTraderProfileQuery,
  useGetPlatformSettingsQuery,
  useListPayoutAccountsQuery,
  useRequestP2PTradeOtpMutation,
} from '@/store/api';

/**
 * P2P escrow market view -- shared between the trainer dashboard's "Market"
 * tab and the distributor dashboard (distributors resell bulk-allocated DL
 * through this same market, see AGENTS.md-equivalent context in
 * app/distributor/page.tsx). Pulled out of TrainerDashboard.tsx so the
 * distributor bundle doesn't have to pull in that entire 2000+ line module
 * (word training, submissions, etc.) just to render this one panel.
 *
 * My posts/My trades management lives on a dedicated route
 * (/dashboard/market-activity or /distributor/market-activity, see
 * activityHref below) -- this view is just the full-width browsable
 * market list plus the create-offer flow.
 */
export function MarketView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityHref = pathname?.startsWith('/distributor')
    ? '/distributor/market-activity'
    : '/dashboard/market-activity';
  const tradesBase = pathname?.startsWith('/distributor') ? '/distributor' : '/dashboard';
  const [offerType, setOfferType] = useState<'SELL' | 'BUY'>('SELL');
  const [tokenAmount, setTokenAmount] = useState('10');
  const [fiatCurrency, setFiatCurrency] = useState('NGN');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const { data: settings } = useGetP2PSettingsQuery();
  const { data: referenceRate } = useGetP2PReferenceRateQuery();
  const { data: payoutAccounts = [] } = useListPayoutAccountsQuery();
  const { data: me } = useGetMeQuery();
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const [createOffer, { isLoading: offerSaving }] = useCreateP2POfferMutation();
  const [fetchOfferForAccept] = useLazyGetP2POfferQuery();
  const [cancelOffer, { isLoading: cancellingOffer, originalArgs: cancellingOfferId }] =
    useCancelP2POfferMutation();
  const [requestTradeOtp, { isLoading: tradeOtpSending }] = useRequestP2PTradeOtpMutation();
  // Any owned payout account can receive P2P payment now, verified or
  // free-entry -- an UNVERIFIED badge is shown per-option instead of
  // hiding unverified accounts from P2P entirely (see
  // P2PService.getEnabledPaymentMethod's updated doc comment).
  const [selectedPayoutAccountIds, setSelectedPayoutAccountIds] = useState<string[]>([]);
  const currencyPayoutAccounts = payoutAccounts.filter(
    (account) => account.currency.toUpperCase() === fiatCurrency,
  );
  const primaryMethod =
    currencyPayoutAccounts.find((account) => selectedPayoutAccountIds.includes(account.id)) ??
    currencyPayoutAccounts.find((account) => account.isDefault) ??
    currencyPayoutAccounts[0];
  const offerPaymentMethodIds =
    selectedPayoutAccountIds.length > 0
      ? selectedPayoutAccountIds
      : primaryMethod
        ? [primaryMethod.id]
        : undefined;
  const phoneVerificationRequired = platformSettings?.phoneVerificationRequired ?? true;
  const phoneVerified = me?.phoneVerified ?? false;
  // Trading is blocked on phone verification only while that requirement
  // is on -- when it's off, createOffer/acceptOffer fall back to an
  // emailed OTP instead (see submitOffer/accept and offerOtpRequestId below).
  const marketDisabled = !settings?.enabled || (phoneVerificationRequired && !phoneVerified);
  const [offerOtpRequestId, setOfferOtpRequestId] = useState<string | null>(null);
  const [offerOtpCode, setOfferOtpCode] = useState('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // Accepting is shared with the offer detail page so the two cannot drift.
  // Accepting from the table lands on the new trade, same as the detail page.
  const acceptFlow = useAcceptOffer({
    onAccepted: (trade) => router.push(`${tradesBase}/trades/${trade.id}`),
  });
  const accepting = acceptFlow.accepting;

  const availableCurrencies = referenceRate?.availableCurrencies ?? [];
  const activeQuote = availableCurrencies.find((quote) => quote.currencyCode === fiatCurrency);
  const fiatAmount = activeQuote
    ? (Number(tokenAmount) * Number(activeQuote.tokenReferencePrice)).toFixed(2)
    : '';
  const usdAmount = referenceRate?.tokenUsdPrice
    ? (Number(tokenAmount) * Number(referenceRate.tokenUsdPrice)).toFixed(2)
    : '';
  const offerPaymentMethod =
    primaryMethod?.type === 'STABLECOIN_WALLET' || ['USDT', 'USDC'].includes(fiatCurrency)
      ? 'STABLECOIN'
      : primaryMethod?.type === 'MOBILE_MONEY'
        ? 'MOBILE_MONEY'
        : 'BANK_TRANSFER';

  // Country currency is the default whenever it has an enabled conversion quote.
  useEffect(() => {
    if (referenceRate?.currencyCode) setFiatCurrency(referenceRate.currencyCode);
  }, [referenceRate?.currencyCode]);

  // Deep-link from the dashboard's Withdraw/Fund DL buttons (now that
  // platform withdrawals/funding are disabled during the P2P transition) --
  // ?create=sell opens the dialog on the Sell DL tab (mirrors Withdraw:
  // trainer wants tokens converted to cash), ?create=buy opens it on Buy
  // request (mirrors Fund DL: trainer wants to add tokens). Strips the
  // param afterward via router.replace so a refresh/back-nav doesn't keep
  // reopening the dialog.
  useEffect(() => {
    const create = searchParams.get('create');
    if (create !== 'sell' && create !== 'buy') return;
    setOfferType(create === 'sell' ? 'SELL' : 'BUY');
    setCreateOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    const query = params.toString();
    router.replace(`${pathname ?? '/dashboard'}${query ? `?${query}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only re-checking when the raw query string changes, not on every router/pathname identity change
  }, [searchParams]);

  // ?accept=<offerId> is a legacy hand-off: the offer detail page now
  // commits in place (see OfferDetailView) rather than bouncing back here.
  // Kept so links and bookmarks already pointing at it still work.
  //
  // The param is stripped once the accept has been kicked off, never before
  // -- stripping it up-front flipped this effect's own dependency, fired its
  // cleanup and cancelled the accept while the offer fetch was still in
  // flight, so nothing happened at all.
  const acceptParam = searchParams.get('accept');
  const handledAcceptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!acceptParam || handledAcceptRef.current === acceptParam) return;
    // Wait for the settings that decide which branch accept() takes. Firing
    // early would read the `?? true` fallback for phoneVerificationRequired
    // and skip the OTP step that the real setting may require.
    if (!platformSettings || !settings) return;
    handledAcceptRef.current = acceptParam;

    void (async () => {
      try {
        const offer = await fetchOfferForAccept(acceptParam).unwrap();
        await acceptFlow.accept(offer);
      } catch (err) {
        setError(normalizeErrorMessage(err, 'Could not open that offer'));
      } finally {
        const params = new URLSearchParams(window.location.search);
        params.delete('accept');
        const query = params.toString();
        router.replace(`${pathname ?? '/dashboard'}${query ? `?${query}` : ''}`, { scroll: false });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs on the accept id, plus the settings gate above
  }, [acceptParam, platformSettings, settings]);

  function updateTokenAmount(value: string) {
    setTokenAmount(value);
  }

  useEffect(() => {
    if (!createOpen || offerType !== 'SELL' || currencyPayoutAccounts.length > 0) return;
    const firstSupportedAccount = payoutAccounts.find((account) =>
      availableCurrencies.some((quote) => quote.currencyCode === account.currency.toUpperCase()),
    );
    if (firstSupportedAccount) setFiatCurrency(firstSupportedAccount.currency.toUpperCase());
  }, [availableCurrencies, createOpen, currencyPayoutAccounts.length, offerType, payoutAccounts]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (!phoneVerificationRequired && !offerOtpRequestId) {
        const otp = await requestTradeOtp({
          action: 'create-offer',
          type: offerType,
          tokenAmount: Number(tokenAmount),
          fiatCurrency,
          paymentMethod: offerPaymentMethod,
          paymentMethodIds: offerType === 'SELL' ? offerPaymentMethodIds : undefined,
        }).unwrap();
        setOfferOtpRequestId(otp.otpRequestId);
        return;
      }
      await createOffer({
        type: offerType,
        tokenAmount: Number(tokenAmount),
        fiatCurrency,
        paymentMethod: offerPaymentMethod,
        paymentMethodIds: offerType === 'SELL' ? offerPaymentMethodIds : undefined,
        ...(offerOtpRequestId
          ? { otpRequestId: offerOtpRequestId, code: offerOtpCode.trim() }
          : {}),
      }).unwrap();
      setCreateOpen(false);
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-black tracking-normal md:text-3xl">DL market</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-extrabold hover:bg-surface-muted"
            href={activityHref}
          >
            My trades &amp; posts <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) {
                setOfferOtpRequestId(null);
                setOfferOtpCode('');
                setSelectedPayoutAccountIds([]);
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
                {activeQuote && (
                  <p className="text-xs text-muted">
                    System rate: 1 DL ≈ {Number(activeQuote.tokenReferencePrice).toLocaleString()}{' '}
                    {fiatCurrency}. The final amount is calculated automatically.
                  </p>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <label className="grid gap-1.5 text-sm font-bold">
                    Payment amount
                    <input
                      className="min-h-11 rounded-lg border border-line bg-surface-muted px-3 text-muted"
                      readOnly
                      value={fiatAmount}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Currency
                    <select
                      className="min-h-11 w-24 rounded-lg border border-line bg-bg px-2 text-center uppercase"
                      onChange={(e) => {
                        setFiatCurrency(e.target.value);
                        setSelectedPayoutAccountIds([]);
                      }}
                      value={fiatCurrency}
                    >
                      {availableCurrencies
                        .filter(
                          (quote) =>
                            offerType === 'BUY' ||
                            payoutAccounts.some(
                              (account) => account.currency.toUpperCase() === quote.currencyCode,
                            ),
                        )
                        .map((quote) => (
                          <option key={quote.currencyCode} value={quote.currencyCode}>
                            {quote.currencyCode}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {usdAmount && (
                  <p className="text-xs font-bold text-muted">USD value: ${usdAmount}</p>
                )}
                {offerType === 'SELL' && payoutAccounts.length === 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Add a payout account in Profile before posting a sell offer.
                  </p>
                )}
                {offerType === 'SELL' &&
                  payoutAccounts.length > 0 &&
                  currencyPayoutAccounts.length === 0 && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      None of your payout accounts can receive {fiatCurrency}. Select another
                      currency or add a matching payout account.
                    </p>
                  )}
                {offerType === 'SELL' && currencyPayoutAccounts.length > 0 && (
                  <fieldset className="grid gap-1.5">
                    <legend className="text-sm font-bold">
                      Receive payment to -- select one or more
                    </legend>
                    <div className="grid gap-1.5">
                      {currencyPayoutAccounts.map((account) => {
                        const label =
                          account.type === 'BANK'
                            ? `${account.bankName ?? account.bankCode} · ${account.accountNumberMasked}`
                            : account.type === 'STABLECOIN_WALLET'
                              ? `${account.stablecoinAsset} · ${account.stablecoinNetwork} · ${account.walletAddressMasked}`
                              : `${account.mobileMoneyNetwork} · ${account.mobileMoneyNumberMasked}`;
                        const checked = selectedPayoutAccountIds.length
                          ? selectedPayoutAccountIds.includes(account.id)
                          : account.id === primaryMethod?.id;
                        return (
                          <label
                            className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-bold"
                            key={account.id}
                          >
                            <input
                              checked={checked}
                              onChange={(e) => {
                                setSelectedPayoutAccountIds((current) => {
                                  const base = current.length
                                    ? current
                                    : primaryMethod
                                      ? [primaryMethod.id]
                                      : [];
                                  return e.target.checked
                                    ? [...base, account.id]
                                    : base.filter((id) => id !== account.id);
                                });
                              }}
                              type="checkbox"
                            />
                            {label}
                            {account.verificationStatus !== 'VERIFIED' && (
                              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                Unverified
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
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
                    !activeQuote ||
                    !fiatAmount ||
                    !Number.isFinite(Number(tokenAmount)) ||
                    Number(tokenAmount) <= 0 ||
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
      </div>
      {(error || acceptFlow.error) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error || acceptFlow.error}
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

      <MarketOfferList
        accepting={accepting}
        cancellingOffer={cancellingOffer}
        cancellingOfferId={cancellingOfferId}
        disabled={marketDisabled}
        settings={settings}
        onAccept={(offer) => void acceptFlow.accept(offer)}
        onCancel={cancelPost}
        onOpenProfile={setProfileUserId}
        viewerId={me?.id}
      />

      <TraderProfileDialog
        onOpenChange={(open) => !open && setProfileUserId(null)}
        userId={profileUserId}
      />

      <AcceptOfferDialogs flow={acceptFlow} />
    </div>
  );
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
