'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

const SUPPORTED_CURRENCIES = ['USDT', 'USDC'];
const SUPPORTED_NETWORKS = ['TRC20', 'ERC20', 'BEP20', 'SOL', 'POLYGON'];

export function WithdrawalSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [cryptoWithdrawalsEnabled, setCryptoWithdrawalsEnabled] = useState(true);
  const [nowPaymentsPayoutsEnabled, setNowPaymentsPayoutsEnabled] = useState(false);
  const [autoSubmitAfterApproval, setAutoSubmitAfterApproval] = useState(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(['USDT']);
  const [allowedNetworks, setAllowedNetworks] = useState<string[]>(['TRC20']);
  const [withdrawalFeeMode, setWithdrawalFeeMode] = useState<'platform' | 'user'>('platform');
  const [withdrawalFeeTokenAmount, setWithdrawalFeeTokenAmount] = useState('');
  const [withdrawalFeePercent, setWithdrawalFeePercent] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setCryptoWithdrawalsEnabled(settings.cryptoWithdrawalsEnabled);
    setNowPaymentsPayoutsEnabled(settings.nowPaymentsPayoutsEnabled);
    setAutoSubmitAfterApproval(settings.autoSubmitAfterApproval);
    setAllowedCurrencies(
      settings.allowedWithdrawalCurrencies
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    );
    setAllowedNetworks(
      settings.allowedWithdrawalNetworks
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    );
    setWithdrawalFeeMode(settings.withdrawalFeeMode === 'user' ? 'user' : 'platform');
    setWithdrawalFeeTokenAmount(settings.withdrawalFeeTokenAmount);
    setWithdrawalFeePercent(settings.withdrawalFeePercent);
  }, [settings]);

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (allowedCurrencies.length === 0) {
      setError('At least one allowed currency is required.');
      return;
    }
    if (allowedNetworks.length === 0) {
      setError('At least one allowed network is required.');
      return;
    }

    try {
      await updateSettings({
        cryptoWithdrawalsEnabled,
        nowPaymentsPayoutsEnabled,
        autoSubmitAfterApproval,
        allowedWithdrawalCurrencies: allowedCurrencies.join(','),
        allowedWithdrawalNetworks: allowedNetworks.join(','),
        withdrawalFeeMode,
        ...(withdrawalFeeTokenAmount !== ''
          ? { withdrawalFeeTokenAmount: Number(withdrawalFeeTokenAmount) }
          : {}),
        ...(withdrawalFeePercent !== ''
          ? { withdrawalFeePercent: Number(withdrawalFeePercent) }
          : {}),
      }).unwrap();
      setMessage('Withdrawal settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save withdrawal settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Crypto Withdrawals</h2>
        <p className="leading-relaxed text-muted">
          Controls for the NOWPayments payout automation -- admin approval and provider submission
          remain separate, manual steps regardless of these settings; see the Withdrawals page to
          act on individual requests.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="crypto-withdrawals-enabled"
            >
              <input
                checked={cryptoWithdrawalsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="crypto-withdrawals-enabled"
                onChange={(event) => setCryptoWithdrawalsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Crypto withdrawals enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master kill switch -- when off, trainers can't request new withdrawals at all.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="nowpayments-payouts-enabled"
            >
              <input
                checked={nowPaymentsPayoutsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="nowpayments-payouts-enabled"
                onChange={(event) => setNowPaymentsPayoutsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">NOWPayments automated payouts enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off, admins can still approve and manually mark withdrawals paid, but "Submit
                  to NOWPayments" is disabled -- keep this off until payout credentials are
                  configured and tested.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="auto-submit-after-approval"
            >
              <input
                checked={autoSubmitAfterApproval}
                className="mt-0.5 size-5 accent-accent"
                id="auto-submit-after-approval"
                onChange={(event) => setAutoSubmitAfterApproval(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Auto-submit after approval</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, approving a withdrawal immediately submits it to NOWPayments in the same
                  action. Leave off (default) to keep approval and provider submission as two
                  distinct, separately auditable steps.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1.5">
            <span className="font-bold">Allowed currencies</span>
            <p className="text-sm leading-relaxed text-muted">
              Trainers can only choose from these when requesting a withdrawal.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_CURRENCIES.map((currency) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2"
                  key={currency}
                >
                  <input
                    checked={allowedCurrencies.includes(currency)}
                    className="size-4 accent-accent"
                    onChange={() => toggle(allowedCurrencies, currency, setAllowedCurrencies)}
                    type="checkbox"
                  />
                  <span className="font-bold">{currency}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="font-bold">Allowed networks</span>
            <p className="text-sm leading-relaxed text-muted">
              Trainers can only choose from these when requesting a withdrawal.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_NETWORKS.map((network) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2"
                  key={network}
                >
                  <input
                    checked={allowedNetworks.includes(network)}
                    className="size-4 accent-accent"
                    onChange={() => toggle(allowedNetworks, network, setAllowedNetworks)}
                    type="checkbox"
                  />
                  <span className="font-bold">{network}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-1">
            <span className="font-bold">Withdrawal fee</span>
            <p className="text-sm leading-relaxed text-muted">
              "Platform" absorbs any provider network fee -- the trainer receives the full DL amount
              worth. "User" deducts a flat DL amount (if set) or a percentage from the payout.
            </p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 font-bold">
                <input
                  checked={withdrawalFeeMode === 'platform'}
                  onChange={() => setWithdrawalFeeMode('platform')}
                  type="radio"
                />
                Platform pays
              </label>
              <label className="flex items-center gap-2 font-bold">
                <input
                  checked={withdrawalFeeMode === 'user'}
                  onChange={() => setWithdrawalFeeMode('user')}
                  type="radio"
                />
                User pays
              </label>
            </div>
          </div>

          {withdrawalFeeMode === 'user' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label className="font-bold" htmlFor="withdrawal-fee-token-amount">
                  Flat fee (DL)
                </label>
                <input
                  className={inputClass}
                  id="withdrawal-fee-token-amount"
                  min="0"
                  onChange={(e) => setWithdrawalFeeTokenAmount(e.target.value)}
                  step="0.01"
                  type="number"
                  value={withdrawalFeeTokenAmount}
                />
              </div>
              <div className="grid gap-1">
                <label className="font-bold" htmlFor="withdrawal-fee-percent">
                  Or percentage (%)
                </label>
                <input
                  className={inputClass}
                  id="withdrawal-fee-percent"
                  max="100"
                  min="0"
                  onChange={(e) => setWithdrawalFeePercent(e.target.value)}
                  step="0.1"
                  type="number"
                  value={withdrawalFeePercent}
                />
              </div>
              <p className="col-span-2 text-xs text-muted">
                Flat fee takes precedence over percentage when both are set above zero.
              </p>
            </div>
          )}

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save withdrawal settings
            </ActionButton>
          </div>
        </form>
      )}

      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
