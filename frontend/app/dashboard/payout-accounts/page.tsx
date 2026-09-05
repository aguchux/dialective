'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ArrowRight, Banknote, Smartphone, Wallet } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DeletePayoutAccountDialog } from '@/components/wallet/DeletePayoutAccountDialog';
import {
  normalizeErrorMessage,
  useCreatePayoutAccountMutation,
  useCreateStripePayoutOnboardingLinkMutation,
  useGetCountriesQuery,
  useGetPublicClientSettingsQuery,
  useListBanksQuery,
  useListPayoutAccountsQuery,
  useRefreshStripePayoutAccountStatusMutation,
  useRequestStablecoinWalletSetupOtpMutation,
  useUpdatePayoutAccountMutation,
} from '@/store/api';

// TRC20 (Tron) is the only network offered -- cheapest gas of any viable
// chain and the de facto standard for USDT/USDC liquidity in the markets
// most trainers actually cash out in. See StripeConnectService/
// FlutterwaveV4Service for the equivalent per-rail country reasoning.
const STABLECOIN_ASSETS = ['USDT', 'USDC'] as const;
const TRON_ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// Flutterwave's fiat rail only covers these markets today -- every other
// country falls straight through to Stripe as the only real option (Stripe
// Connect Express's own country coverage is broad and changes over time, so
// rather than hardcode a second list that will go stale, "not Flutterwave"
// is treated as "try Stripe" and a genuinely unsupported country surfaces as
// a real error from stripe.accounts.create at submit time).
const FLUTTERWAVE_COUNTRIES: Record<string, string> = {
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  UG: 'UGX',
  ZA: 'ZAR',
  TZ: 'TZS',
};

const MOBILE_MONEY_NETWORKS = ['MTN', 'AIRTEL', 'VODAFONE', 'TIGO'];

const inputClass =
  'min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent';
const primaryButtonClass =
  'min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const ghostButtonClass =
  'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-muted transition-colors hover:bg-surface-muted hover:text-ink';

export default function PayoutAccountsPage() {
  const { status } = useSession();
  const {
    data: accounts,
    isLoading,
    isError,
    error,
  } = useListPayoutAccountsQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const [updateAccount] = useUpdatePayoutAccountMutation();
  const [createOnboardingLink, { isLoading: isCreatingLink }] =
    useCreateStripePayoutOnboardingLinkMutation();
  const [refreshStatus, { isLoading: isRefreshing }] =
    useRefreshStripePayoutAccountStatusMutation();
  const [rowError, setRowError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<{ id: string; label: string } | null>(
    null,
  );

  async function handleSetDefault(id: string) {
    setRowError(null);
    try {
      await updateAccount({ id, isDefault: true }).unwrap();
    } catch (err) {
      setRowError(normalizeErrorMessage(err, 'Unable to set this account as default.'));
    }
  }

  async function handleContinueStripeOnboarding(id: string) {
    setRowError(null);
    try {
      const { onboardingUrl } = await createOnboardingLink(id).unwrap();
      window.location.href = onboardingUrl;
    } catch (err) {
      setRowError(normalizeErrorMessage(err, 'Unable to continue Stripe onboarding.'));
    }
  }

  async function handleRefreshStripeStatus(id: string) {
    setRowError(null);
    try {
      await refreshStatus(id).unwrap();
    } catch (err) {
      setRowError(normalizeErrorMessage(err, 'Unable to refresh Stripe status.'));
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6 p-4 sm:p-6">
      <Link
        className="inline-flex items-center gap-1.5 text-sm font-bold text-accent"
        href="/dashboard"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to dashboard
      </Link>

      <div className="grid gap-2">
        <h1 className="text-3xl font-black">Payout methods</h1>
        <p className="leading-relaxed text-muted">
          Saved bank accounts and mobile money numbers you can withdraw DL to. Add one here, then
          select it when you withdraw.
        </p>
      </div>

      {isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
          {normalizeErrorMessage(error, 'Unable to load your payout accounts.')}
        </p>
      )}
      {rowError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
          {rowError}
        </p>
      )}

      <div className="grid gap-3">
        {isLoading && <p className="text-muted">Loading...</p>}
        {!isLoading && (accounts?.length ?? 0) === 0 && (
          <p className="rounded-lg border border-line bg-white p-5 text-muted">
            No payout methods saved yet.
          </p>
        )}
        {accounts?.map((account) => (
          <div
            className="grid gap-2 rounded-lg border border-line bg-white p-4 shadow-[0_2px_8px_rgba(27,31,27,0.05)]"
            key={account.id}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-extrabold">
                <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-white">
                  {account.type === 'STRIPE_CONNECT' ? (
                    <StripeIcon className="size-4" />
                  ) : account.type === 'STABLECOIN_WALLET' ? (
                    <Wallet className="size-4" aria-hidden="true" />
                  ) : (
                    <FlutterwaveIcon className="size-4" />
                  )}
                </span>
                {account.type === 'BANK'
                  ? (account.bankName ?? account.bankCode)
                  : account.type === 'MOBILE_MONEY'
                    ? account.mobileMoneyNetwork
                    : account.type === 'STABLECOIN_WALLET'
                      ? `${account.stablecoinAsset} (${account.stablecoinNetwork})`
                      : 'Stripe Connect'}
              </p>
              {account.isDefault && (
                <span className="rounded-md bg-accent-soft px-2.5 py-1 text-xs font-extrabold text-accent-dark">
                  Default
                </span>
              )}
            </div>
            <p className="text-sm text-muted">
              {account.type === 'BANK'
                ? account.accountNumberMasked
                : account.type === 'MOBILE_MONEY'
                  ? account.mobileMoneyNumberMasked
                  : account.type === 'STABLECOIN_WALLET'
                    ? account.walletAddressMasked
                    : account.stripePayoutsEnabled
                      ? 'Onboarding complete -- ready for payouts'
                      : 'Onboarding not finished yet'}
              {account.accountName ? ` · ${account.accountName}` : ''}
            </p>
            {account.type === 'MOBILE_MONEY' && account.verificationStatus === 'UNVERIFIED' && (
              <p className="text-xs font-bold text-danger">
                We could not pre-verify this mobile money account -- double-check the number is
                correct.
              </p>
            )}
            {account.type === 'STRIPE_CONNECT' && !account.stripePayoutsEnabled && (
              <p className="text-xs font-bold text-danger">
                Finish setup on Stripe to enable payouts to this account.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {account.type === 'STRIPE_CONNECT' && !account.stripePayoutsEnabled && (
                <ActionButton
                  className={secondaryButtonClass}
                  onClick={() => handleContinueStripeOnboarding(account.id)}
                  pending={isCreatingLink}
                  pendingLabel="Opening Stripe..."
                  type="button"
                >
                  Continue setup on Stripe
                </ActionButton>
              )}
              {account.type === 'STRIPE_CONNECT' && !account.stripePayoutsEnabled && (
                <ActionButton
                  className={secondaryButtonClass}
                  onClick={() => handleRefreshStripeStatus(account.id)}
                  pending={isRefreshing}
                  pendingLabel="Checking..."
                  type="button"
                >
                  I finished -- check status
                </ActionButton>
              )}
              {!account.isDefault && (
                <button
                  className={secondaryButtonClass}
                  onClick={() => handleSetDefault(account.id)}
                  type="button"
                >
                  Set as default
                </button>
              )}
              <button
                className={secondaryButtonClass}
                onClick={() =>
                  setDeletingAccount({
                    id: account.id,
                    label:
                      account.type === 'BANK'
                        ? (account.bankName ?? account.bankCode ?? 'this bank account')
                        : account.type === 'MOBILE_MONEY'
                          ? (account.mobileMoneyNumberMasked ?? 'this mobile money account')
                          : account.type === 'STABLECOIN_WALLET'
                            ? (account.walletAddressMasked ?? 'this wallet')
                            : 'this Stripe Connect account',
                  })
                }
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <AddPayoutAccountDialog
        stripeEnabled={publicSettings?.isStripePayoutsEnabled ?? false}
        cryptoEnabled={publicSettings?.isCryptoWithdrawalsEnabled ?? false}
      />
      {deletingAccount && (
        <DeletePayoutAccountDialog
          account={deletingAccount}
          onClose={() => setDeletingAccount(null)}
        />
      )}
    </div>
  );
}

// CRYPTO_WALLET has no country -- it's offered on the provider step for
// EVERY country (including one Flutterwave and Stripe both reject, like
// Ethiopia), closing the dead-end a trainer would otherwise hit when no
// fiat rail covers their country. See stripe-connect.service.ts's
// StripeInvalidRequestError handling for the error this now gives a real
// alternative to.
type Provider = 'FLUTTERWAVE' | 'STRIPE_CONNECT' | 'CRYPTO_WALLET';
type WizardStep = 'country' | 'provider' | 'details' | 'wallet-otp';

/**
 * Add-payout-method flow: pick a country, see which rails are actually
 * usable there (Flutterwave only for its 6 supported markets, Stripe as the
 * broad fallback everywhere else -- see FLUTTERWAVE_COUNTRIES' doc comment),
 * plus a USDT/USDC TRC20 wallet offered regardless of country, then the
 * provider-specific detail form. A wallet setup additionally requires
 * confirming an emailed OTP (wallet-otp step) before it's saved and locked
 * -- see PayoutAccountsController.requestStablecoinWalletSetupOtp/create.
 */
function AddPayoutAccountDialog({
  stripeEnabled,
  cryptoEnabled,
}: {
  stripeEnabled: boolean;
  cryptoEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('country');
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [flutterwaveType, setFlutterwaveType] = useState<'BANK' | 'MOBILE_MONEY'>('BANK');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [mobileMoneyNetwork, setMobileMoneyNetwork] = useState(MOBILE_MONEY_NETWORKS[0]);
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [stablecoinAsset, setStablecoinAsset] = useState<(typeof STABLECOIN_ASSETS)[number]>('USDT');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletOtpRequestId, setWalletOtpRequestId] = useState<string | null>(null);
  const [walletCode, setWalletCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: countries, isLoading: isLoadingCountries } = useGetCountriesQuery(undefined, {
    skip: !open,
  });
  const flutterwaveCurrency = FLUTTERWAVE_COUNTRIES[countryCode];
  const flutterwaveAvailable = Boolean(flutterwaveCurrency);
  const { data: banks, isLoading: isLoadingBanks } = useListBanksQuery(countryCode, {
    skip: provider !== 'FLUTTERWAVE' || flutterwaveType !== 'BANK' || !open,
  });
  const [createAccount, { isLoading: isSubmitting }] = useCreatePayoutAccountMutation();
  const [requestWalletOtp, { isLoading: isRequestingWalletOtp }] =
    useRequestStablecoinWalletSetupOtpMutation();

  function reset() {
    setStep('country');
    setCountryCode('');
    setCountryName('');
    setProvider(null);
    setFlutterwaveType('BANK');
    setBankCode('');
    setAccountNumber('');
    setMobileMoneyNumber('');
    setStablecoinAsset('USDT');
    setWalletAddress('');
    setWalletOtpRequestId(null);
    setWalletCode('');
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function goToProviderStep(code: string, name: string) {
    setCountryCode(code);
    setCountryName(name);
    setProvider(null);
    setStep('provider');
  }

  function goToDetailsStep(nextProvider: Provider) {
    setProvider(nextProvider);
    setStep('details');
  }

  const walletAddressValid = TRON_ADDRESS_PATTERN.test(walletAddress);

  /** Wallet setup's own two-step submit: request the OTP first, then (on the wallet-otp screen) verify + save. Distinct from handleSubmit below, which never issues its own OTP -- BANK/MOBILE_MONEY/STRIPE_CONNECT have no setup-OTP step. */
  async function handleWalletSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!walletAddressValid) {
      setError('Enter a valid TRC20 (Tron) wallet address -- it must start with "T" and be 34 characters long.');
      return;
    }
    try {
      if (!walletOtpRequestId) {
        const result = await requestWalletOtp({
          stablecoinAsset,
          stablecoinNetwork: 'TRC20',
          walletAddress,
        }).unwrap();
        setWalletOtpRequestId(result.otpRequestId);
        setStep('wallet-otp');
        return;
      }
      await createAccount({
        type: 'STABLECOIN_WALLET',
        stablecoinAsset,
        stablecoinNetwork: 'TRC20',
        walletAddress,
        otpRequestId: walletOtpRequestId,
        code: walletCode,
      }).unwrap();
      handleOpenChange(false);
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          walletOtpRequestId ? 'Unable to verify this code.' : 'Unable to send a confirmation code.',
        ),
      );
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (provider === 'FLUTTERWAVE' && flutterwaveType === 'BANK' && !bankCode) {
      setError('Select a bank.');
      return;
    }
    try {
      const result = await createAccount({
        type: provider === 'STRIPE_CONNECT' ? 'STRIPE_CONNECT' : flutterwaveType,
        country: countryCode,
        currency: provider === 'STRIPE_CONNECT' ? 'USD' : flutterwaveCurrency,
        ...(provider === 'FLUTTERWAVE' && flutterwaveType === 'BANK'
          ? { bankCode, accountNumber }
          : provider === 'FLUTTERWAVE'
            ? { mobileMoneyNetwork, mobileMoneyNumber }
            : {}),
      }).unwrap();
      handleOpenChange(false);
      // A Stripe Connect account is useless until the trainer finishes
      // Stripe's own hosted onboarding -- send them there immediately
      // rather than leaving them on a saved-but-unusable account row.
      if (provider === 'STRIPE_CONNECT' && result.onboardingUrl) {
        window.location.href = result.onboardingUrl;
      }
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this payout account.'));
    }
  }

  const stepTitle: Record<WizardStep, string> = {
    country: 'Add a payout method',
    provider: `Payout options for ${countryName}`,
    details:
      provider === 'STRIPE_CONNECT'
        ? 'Connect with Stripe'
        : provider === 'CRYPTO_WALLET'
          ? 'USDT / USDC wallet'
          : 'Bank or mobile money details',
    'wallet-otp': 'Confirm your wallet',
  };
  const stepDescription: Record<WizardStep, string> = {
    country: 'Start by telling us where you are -- this decides which payout providers we can offer.',
    provider: 'Choose how you want to receive your DL withdrawals.',
    details:
      provider === 'CRYPTO_WALLET'
        ? 'This address is saved and locked once confirmed -- double-check it before continuing.'
        : 'Bank details are encrypted and only used to send you DL withdrawals.',
    'wallet-otp': `We emailed a 6-digit code to confirm and save this ${stablecoinAsset} wallet.`,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={primaryButtonClass}>+ Add payout method</DialogTrigger>
      <DialogContent description={stepDescription[step]} title={stepTitle[step]}>
        {step !== 'country' && (
          <button
            className={`${ghostButtonClass} -mt-2 justify-self-start`}
            onClick={() => {
              if (step === 'wallet-otp') {
                setWalletOtpRequestId(null);
                setWalletCode('');
                setError(null);
                setStep('details');
                return;
              }
              setStep(step === 'details' ? 'provider' : 'country');
            }}
            type="button"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </button>
        )}

        {step === 'country' && (
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-bold">
              Country
              <SearchableSelect
                className={inputClass}
                emptyLabel="No countries match your search"
                loading={isLoadingCountries}
                loadingLabel="Loading countries..."
                onChange={(value) => {
                  const match = countries?.find((c) => c.code === value);
                  if (match) goToProviderStep(match.code, match.name);
                }}
                options={(countries ?? []).map((c) => ({ value: c.code, label: c.name }))}
                placeholder="Search for your country"
                value={countryCode}
              />
            </label>
          </div>
        )}

        {step === 'provider' && (
          <div className="grid gap-3">
            {flutterwaveAvailable && (
              <ProviderCard
                description="Bank transfer or mobile money, sent directly to a local account via Flutterwave."
                icon={<FlutterwaveIcon className="size-7" />}
                onClick={() => goToDetailsStep('FLUTTERWAVE')}
                title="Flutterwave"
              />
            )}
            {stripeEnabled && (
              <ProviderCard
                description="Connect a Stripe account -- Stripe securely collects and verifies your bank details on their own page."
                icon={<StripeIcon className="size-7" />}
                onClick={() => goToDetailsStep('STRIPE_CONNECT')}
                title="Stripe"
              />
            )}
            {cryptoEnabled && (
              <ProviderCard
                description="Withdraw to your own USDT or USDC wallet on the TRC20 (Tron) network -- fast, low fees, works from any country."
                icon={<Wallet className="size-7" aria-hidden="true" />}
                onClick={() => goToDetailsStep('CRYPTO_WALLET')}
                title="USDT / USDC wallet"
              />
            )}
            {!flutterwaveAvailable && !stripeEnabled && !cryptoEnabled && (
              <p className="rounded-lg border border-line bg-surface-muted p-4 text-sm text-muted">
                No payout provider is available for {countryName} yet. Contact support for help.
              </p>
            )}
          </div>
        )}

        {step === 'details' && provider === 'CRYPTO_WALLET' && (
          <form className="grid gap-3" onSubmit={handleWalletSubmit}>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-bold">Asset</legend>
              <div className="grid grid-cols-2 gap-2">
                {STABLECOIN_ASSETS.map((asset) => (
                  <label
                    className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-center font-extrabold ${stablecoinAsset === asset ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                    key={asset}
                  >
                    <input
                      className="sr-only"
                      checked={stablecoinAsset === asset}
                      name="stablecoin-asset"
                      onChange={() => setStablecoinAsset(asset)}
                      type="radio"
                    />
                    {asset}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted">Network: TRC20 (Tron) -- the only network we support today.</p>
            <label className="grid gap-1.5 text-sm font-bold">
              Wallet address
              <input
                className={inputClass}
                onChange={(event) => setWalletAddress(event.target.value.trim())}
                placeholder="T..."
                required
                type="text"
                value={walletAddress}
              />
            </label>
            {walletAddress.length > 0 && !walletAddressValid && (
              <p className="text-xs font-bold text-danger">
                This doesn&apos;t look like a valid TRC20 address -- it must start with &quot;T&quot;
                and be 34 characters long.
              </p>
            )}
            <p className="text-xs font-bold text-danger">
              Double-check this address. Funds sent to a wrong or unsupported-network address cannot
              be recovered. This address is locked once confirmed -- to change it later you&apos;ll
              need to delete this wallet and add a new one.
            </p>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
              <ActionButton
                className={primaryButtonClass}
                disabled={!walletAddressValid}
                pending={isRequestingWalletOtp}
                pendingLabel="Sending code"
                type="submit"
              >
                Send confirmation code
              </ActionButton>
            </div>
          </form>
        )}

        {step === 'wallet-otp' && (
          <form className="grid gap-3" onSubmit={handleWalletSubmit}>
            <p className="text-sm text-muted">
              Confirming <span className="font-bold text-ink">{stablecoinAsset}</span> to{' '}
              <span className="font-mono font-bold text-ink">{walletAddress}</span>
            </p>
            <input
              autoFocus
              className={`${inputClass} text-center text-lg font-bold tracking-[0.3em]`}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setWalletCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              value={walletCode}
            />
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
              <ActionButton
                className={primaryButtonClass}
                disabled={walletCode.length !== 6}
                pending={isSubmitting}
                pendingLabel="Saving"
                type="submit"
              >
                Confirm and save
              </ActionButton>
            </div>
          </form>
        )}

        {step === 'details' && provider !== 'CRYPTO_WALLET' && (
          <form className="grid gap-3" onSubmit={handleSubmit}>
            {provider === 'STRIPE_CONNECT' && (
              <p className="text-sm leading-relaxed text-muted">
                You&apos;ll be redirected to Stripe to enter and verify your bank details -- we
                never see your raw bank account number for this option.
              </p>
            )}

            {provider === 'FLUTTERWAVE' && (
              <>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-bold">Type</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'BANK', label: 'Bank account', icon: Banknote },
                        { value: 'MOBILE_MONEY', label: 'Mobile money', icon: Smartphone },
                      ] as const
                    ).map((option) => (
                      <label
                        className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-center font-extrabold ${flutterwaveType === option.value ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                        key={option.value}
                      >
                        <input
                          className="sr-only"
                          checked={flutterwaveType === option.value}
                          name="flutterwave-type"
                          onChange={() => setFlutterwaveType(option.value)}
                          type="radio"
                        />
                        <option.icon className="size-4" aria-hidden="true" />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {flutterwaveType === 'BANK' && (
                  <>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Bank
                      <SearchableSelect
                        className={inputClass}
                        emptyLabel="No banks match your search"
                        loading={isLoadingBanks}
                        loadingLabel="Loading banks..."
                        onChange={setBankCode}
                        options={(banks ?? []).map((bank) => ({
                          value: bank.code,
                          label: bank.name,
                        }))}
                        placeholder="Search for a bank"
                        value={bankCode}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Account number
                      <input
                        className={inputClass}
                        onChange={(event) => setAccountNumber(event.target.value.trim())}
                        required
                        type="text"
                        value={accountNumber}
                      />
                    </label>
                    <p className="text-xs text-muted">
                      We&apos;ll verify this account with your bank and show you the account
                      holder&apos;s name before saving.
                    </p>
                  </>
                )}

                {flutterwaveType === 'MOBILE_MONEY' && (
                  <>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Network
                      <select
                        className={inputClass}
                        onChange={(event) => setMobileMoneyNetwork(event.target.value)}
                        value={mobileMoneyNetwork}
                      >
                        {MOBILE_MONEY_NETWORKS.map((network) => (
                          <option key={network} value={network}>
                            {network}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Phone number
                      <input
                        className={inputClass}
                        onChange={(event) => setMobileMoneyNumber(event.target.value.trim())}
                        required
                        type="tel"
                        value={mobileMoneyNumber}
                      />
                    </label>
                    <p className="text-xs font-bold text-danger">
                      We cannot pre-verify mobile money accounts -- double-check the number is
                      correct. Funds sent to a wrong number cannot be recovered.
                    </p>
                  </>
                )}
              </>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
              <ActionButton
                className={primaryButtonClass}
                pending={isSubmitting}
                pendingLabel="Saving"
                type="submit"
              >
                {provider === 'STRIPE_CONNECT' ? (
                  <>
                    Continue to Stripe <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                ) : (
                  'Save'
                )}
              </ActionButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderCard({
  description,
  icon,
  onClick,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft"
      onClick={onClick}
      type="button"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-white">
        {icon}
      </span>
      <span className="grid gap-0.5">
        <span className="font-extrabold">{title}</span>
        <span className="text-sm text-muted">{description}</span>
      </span>
      <ArrowRight className="ml-auto mt-2 size-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}

/** Flutterwave's brand mark (the "star" logomark, no wordmark -- reads cleanly at small sizes). */
function FlutterwaveIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32">
      <rect fill="#F5A623" height="32" rx="7" width="32" />
      <path
        d="M16 6.5c1.1 2.4 2.9 4.1 5.3 5.2-2.4 1.1-4.2 2.9-5.3 5.3-1.1-2.4-2.9-4.2-5.3-5.3 2.4-1.1 4.2-2.8 5.3-5.2Z"
        fill="#fff"
      />
      <path
        d="M22.5 17c.7 1.5 1.8 2.6 3.3 3.3-1.5.7-2.6 1.8-3.3 3.3-.7-1.5-1.8-2.6-3.3-3.3 1.5-.7 2.6-1.8 3.3-3.3Z"
        fill="#fff"
      />
      <path
        d="M9 18c.6 1.3 1.6 2.3 2.9 2.9-1.3.6-2.3 1.6-2.9 2.9-.6-1.3-1.6-2.3-2.9-2.9 1.3-.6 2.3-1.6 2.9-2.9Z"
        fill="#fff"
      />
    </svg>
  );
}

/** Stripe's brand mark (the "S" ribbon on the brand purple). */
function StripeIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32">
      <rect fill="#635BFF" height="32" rx="7" width="32" />
      <path
        d="M14.6 13.4c0-.7.6-1 1.6-1 1.4 0 3.2.4 4.6 1.2v-4.4c-1.5-.6-3-.9-4.6-.9-3.8 0-6.3 2-6.3 5.3 0 5.1 7.1 4.3 7.1 6.6 0 .8-.7 1.1-1.7 1.1-1.5 0-3.5-.6-5.1-1.5v4.5c1.7.7 3.4 1 5.1 1 3.9 0 6.5-1.9 6.5-5.3 0-5.5-7.2-4.5-7.2-6.6Z"
        fill="#fff"
      />
    </svg>
  );
}
