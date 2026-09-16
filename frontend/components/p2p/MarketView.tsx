'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { Avatar, cardClass, formatDate } from '@/components/dashboard/shared';
import { MarketOfferList } from '@/components/p2p/MarketOfferList';
import {
  P2POffer,
  normalizeErrorMessage,
  useAcceptP2POfferMutation,
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
  const activityHref = pathname?.startsWith('/distributor')
    ? '/distributor/market-activity'
    : '/dashboard/market-activity';
  const [offerType, setOfferType] = useState<'SELL' | 'BUY'>('SELL');
  const [tokenAmount, setTokenAmount] = useState('10');
  const [fiatAmount, setFiatAmount] = useState('10000');
  const [fiatCurrency, setFiatCurrency] = useState('NGN');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const { data: settings } = useGetP2PSettingsQuery();
  const { data: referenceRate } = useGetP2PReferenceRateQuery();
  const { data: payoutAccounts = [] } = useListPayoutAccountsQuery();
  const { data: me } = useGetMeQuery();
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const [createOffer, { isLoading: offerSaving }] = useCreateP2POfferMutation();
  const [acceptOffer, { isLoading: accepting }] = useAcceptP2POfferMutation();
  const [cancelOffer, { isLoading: cancellingOffer, originalArgs: cancellingOfferId }] =
    useCancelP2POfferMutation();
  const [requestTradeOtp, { isLoading: tradeOtpSending }] = useRequestP2PTradeOtpMutation();
  // Any owned payout account can receive P2P payment now, verified or
  // free-entry -- an UNVERIFIED badge is shown per-option instead of
  // hiding unverified accounts from P2P entirely (see
  // P2PService.getEnabledPaymentMethod's updated doc comment).
  const [selectedPayoutAccountIds, setSelectedPayoutAccountIds] = useState<string[]>([]);
  const primaryMethod =
    payoutAccounts.find((account) => selectedPayoutAccountIds.includes(account.id)) ??
    payoutAccounts.find((account) => account.isDefault) ??
    payoutAccounts[0];
  const phoneVerificationRequired = platformSettings?.phoneVerificationRequired ?? true;
  const phoneVerified = me?.phoneVerified ?? false;
  // Trading is blocked on phone verification only while that requirement
  // is on -- when it's off, createOffer/acceptOffer fall back to an
  // emailed OTP instead (see submitOffer/accept and offerOtpRequestId below).
  const marketDisabled = !settings?.enabled || (phoneVerificationRequired && !phoneVerified);
  const [offerOtpRequestId, setOfferOtpRequestId] = useState<string | null>(null);
  const [offerOtpCode, setOfferOtpCode] = useState('');
  const [pendingAcceptOffer, setPendingAcceptOffer] = useState<P2POffer | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // Set when a SELL offer lists more than one receive-account -- the buyer
  // must pick which one they'll pay into before accepting proceeds (see
  // P2PService.acceptOffer's offer-listed-accounts validation).
  const [accountPickerOffer, setAccountPickerOffer] = useState<P2POffer | null>(null);
  const [chosenSellerPaymentMethodId, setChosenSellerPaymentMethodId] = useState<string | null>(
    null,
  );

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
        paymentMethodIds:
          offerType === 'SELL'
            ? selectedPayoutAccountIds.length > 0
              ? selectedPayoutAccountIds
              : primaryMethod
                ? [primaryMethod.id]
                : undefined
            : undefined,
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

  async function accept(offer: P2POffer) {
    setError('');
    // A SELL offer with more than one receive-account needs the buyer to
    // pick one before anything else happens -- show the picker and let its
    // confirm button re-invoke accept() with the choice already made.
    if (offer.type === 'SELL' && offer.paymentMethods.length > 1 && !chosenSellerPaymentMethodId) {
      setAccountPickerOffer(offer);
      return;
    }
    const sellerPaymentMethodId =
      offer.type === 'SELL' ? (chosenSellerPaymentMethodId ?? undefined) : primaryMethod?.id;
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
      await acceptOffer({ id: offer.id, sellerPaymentMethodId }).unwrap();
      setChosenSellerPaymentMethodId(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not accept offer'));
    }
  }

  async function confirmAcceptOffer() {
    if (!pendingAcceptOffer || !offerOtpRequestId) return;
    setError('');
    const sellerPaymentMethodId =
      pendingAcceptOffer.type === 'SELL'
        ? (chosenSellerPaymentMethodId ?? undefined)
        : primaryMethod?.id;
    try {
      await acceptOffer({
        id: pendingAcceptOffer.id,
        sellerPaymentMethodId,
        otpRequestId: offerOtpRequestId,
        code: offerOtpCode.trim(),
      }).unwrap();
      setPendingAcceptOffer(null);
      setOfferOtpRequestId(null);
      setOfferOtpCode('');
      setChosenSellerPaymentMethodId(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not verify this code'));
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
                {offerType === 'SELL' && payoutAccounts.length === 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Add a payout account in Profile before posting a sell offer.
                  </p>
                )}
                {offerType === 'SELL' && payoutAccounts.length > 0 && (
                  <fieldset className="grid gap-1.5">
                    <legend className="text-sm font-bold">
                      Receive payment to -- select one or more
                    </legend>
                    <div className="grid gap-1.5">
                      {payoutAccounts.map((account) => {
                        const label =
                          account.type === 'BANK'
                            ? `${account.bankName ?? account.bankCode} · ${account.accountNumberMasked}`
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
                    (offerType === 'SELL' && payoutAccounts.length === 0) ||
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

      <MarketOfferList
        accepting={accepting}
        cancellingOffer={cancellingOffer}
        cancellingOfferId={cancellingOfferId}
        disabled={marketDisabled}
        settings={settings}
        onAccept={accept}
        onCancel={cancelPost}
        onOpenProfile={setProfileUserId}
        viewerId={me?.id}
      />

      <TraderProfileDialog
        onOpenChange={(open) => !open && setProfileUserId(null)}
        userId={profileUserId}
      />

      {accountPickerOffer && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setAccountPickerOffer(null);
              setChosenSellerPaymentMethodId(null);
            }
          }}
        >
          <DialogContent
            title="Choose payment account"
            description="This seller accepts payment to more than one account -- pick which one you'll pay."
          >
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                {accountPickerOffer.paymentMethods.map((method) => (
                  <label
                    className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-bold"
                    key={method.id}
                  >
                    <input
                      checked={chosenSellerPaymentMethodId === method.id}
                      name="seller-payment-method"
                      onChange={() => setChosenSellerPaymentMethodId(method.id)}
                      type="radio"
                    />
                    {method.label}
                    {!method.verified && (
                      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Unverified
                      </span>
                    )}
                  </label>
                ))}
              </div>
              {error && <p className="text-sm font-bold text-danger">{error}</p>}
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!chosenSellerPaymentMethodId}
                onClick={() => {
                  const offer = accountPickerOffer;
                  setAccountPickerOffer(null);
                  if (offer) void accept(offer);
                }}
                pending={accepting}
                pendingLabel="Continuing"
                type="button"
              >
                Continue
              </ActionButton>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {pendingAcceptOffer && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPendingAcceptOffer(null);
              setOfferOtpRequestId(null);
              setOfferOtpCode('');
              setChosenSellerPaymentMethodId(null);
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
