'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DeletePayoutAccountDialog } from '@/components/wallet/DeletePayoutAccountDialog';
import {
  normalizeErrorMessage,
  useCreatePayoutAccountMutation,
  useCreateStripePayoutOnboardingLinkMutation,
  useGetPublicClientSettingsQuery,
  useListBanksQuery,
  useListPayoutAccountsQuery,
  useRefreshStripePayoutAccountStatusMutation,
  useUpdatePayoutAccountMutation,
} from '@/store/api';

const FLUTTERWAVE_COUNTRIES: { code: string; currency: string; label: string }[] = [
  { code: 'NG', currency: 'NGN', label: 'Nigeria (NGN)' },
  { code: 'GH', currency: 'GHS', label: 'Ghana (GHS)' },
  { code: 'KE', currency: 'KES', label: 'Kenya (KES)' },
  { code: 'UG', currency: 'UGX', label: 'Uganda (UGX)' },
  { code: 'ZA', currency: 'ZAR', label: 'South Africa (ZAR)' },
  { code: 'TZ', currency: 'TZS', label: 'Tanzania (TZS)' },
];

const MOBILE_MONEY_NETWORKS = ['MTN', 'AIRTEL', 'VODAFONE', 'TIGO'];

const inputClass =
  'min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent';
const primaryButtonClass =
  'min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

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
              <p className="font-extrabold">
                {account.type === 'BANK'
                  ? (account.bankName ?? account.bankCode)
                  : account.type === 'MOBILE_MONEY'
                    ? account.mobileMoneyNetwork
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

      <AddPayoutAccountDialog stripeEnabled={publicSettings?.isStripePayoutsEnabled ?? false} />
      {deletingAccount && (
        <DeletePayoutAccountDialog
          account={deletingAccount}
          onClose={() => setDeletingAccount(null)}
        />
      )}
    </div>
  );
}

function AddPayoutAccountDialog({ stripeEnabled }: { stripeEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'BANK' | 'MOBILE_MONEY' | 'STRIPE_CONNECT'>('BANK');
  const [countryCode, setCountryCode] = useState(FLUTTERWAVE_COUNTRIES[0].code);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [mobileMoneyNetwork, setMobileMoneyNetwork] = useState(MOBILE_MONEY_NETWORKS[0]);
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selectedCountry =
    FLUTTERWAVE_COUNTRIES.find((c) => c.code === countryCode) ?? FLUTTERWAVE_COUNTRIES[0];
  const { data: banks, isLoading: isLoadingBanks } = useListBanksQuery(countryCode, {
    skip: type !== 'BANK' || !open,
  });
  const [createAccount, { isLoading }] = useCreatePayoutAccountMutation();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (type === 'BANK' && !bankCode) {
      setError('Select a bank.');
      return;
    }
    try {
      const result = await createAccount({
        type,
        country: countryCode,
        currency: type === 'STRIPE_CONNECT' ? 'USD' : selectedCountry.currency,
        ...(type === 'BANK'
          ? { bankCode, accountNumber }
          : type === 'MOBILE_MONEY'
            ? { mobileMoneyNetwork, mobileMoneyNumber }
            : {}),
      }).unwrap();
      setBankCode('');
      setAccountNumber('');
      setMobileMoneyNumber('');
      setOpen(false);
      // A Stripe Connect account is useless until the trainer finishes
      // Stripe's own hosted onboarding -- send them there immediately
      // rather than leaving them on a saved-but-unusable account row.
      if (type === 'STRIPE_CONNECT' && result.onboardingUrl) {
        window.location.href = result.onboardingUrl;
      }
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this payout account.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={primaryButtonClass}>+ Add payout method</DialogTrigger>
      <DialogContent
        title="Add a payout method"
        description="Bank details are encrypted and only used to send you DL withdrawals."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-bold">Type</legend>
            <div className={`grid gap-2 ${stripeEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {(
                [
                  { value: 'BANK', label: 'Bank account' },
                  { value: 'MOBILE_MONEY', label: 'Mobile money' },
                  ...(stripeEnabled
                    ? [{ value: 'STRIPE_CONNECT' as const, label: 'Stripe' }]
                    : []),
                ] as const
              ).map((option) => (
                <label
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center font-extrabold ${type === option.value ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                  key={option.value}
                >
                  <input
                    className="sr-only"
                    checked={type === option.value}
                    name="type"
                    onChange={() => setType(option.value)}
                    type="radio"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          {type === 'STRIPE_CONNECT' && (
            <p className="text-xs text-muted">
              You&apos;ll be redirected to Stripe to enter and verify your bank details -- we
              never see your raw bank account number for this option.
            </p>
          )}

          {type !== 'STRIPE_CONNECT' && (
            <label className="grid gap-1.5 text-sm font-bold">
              Country
              <select
                className={inputClass}
                onChange={(event) => setCountryCode(event.target.value)}
                value={countryCode}
              >
                {FLUTTERWAVE_COUNTRIES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {type === 'BANK' && (
            <>
              <label className="grid gap-1.5 text-sm font-bold">
                Bank
                <SearchableSelect
                  className={inputClass}
                  emptyLabel="No banks match your search"
                  loading={isLoadingBanks}
                  loadingLabel="Loading banks..."
                  onChange={setBankCode}
                  options={(banks ?? []).map((bank) => ({ value: bank.code, label: bank.name }))}
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
                We&apos;ll verify this account with your bank and show you the account holder&apos;s
                name before saving.
              </p>
            </>
          )}

          {type === 'MOBILE_MONEY' && (
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
                We cannot pre-verify mobile money accounts -- double-check the number is correct.
                Funds sent to a wrong number cannot be recovered.
              </p>
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
              pending={isLoading}
              pendingLabel="Saving"
              type="submit"
            >
              Save
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
