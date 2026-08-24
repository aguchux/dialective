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

export function FlutterwaveSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [fundingEnabled, setFundingEnabled] = useState(false);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [v4Enabled, setV4Enabled] = useState(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState('NGN,GHS,KES,UGX,ZAR,TZS');
  const [allowedCountries, setAllowedCountries] = useState('NG,GH,KE,UG,ZA,TZ');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setFundingEnabled(settings.isFlutterwaveFundingEnabled);
    setPayoutsEnabled(settings.isFlutterwavePayoutsEnabled);
    setV4Enabled(settings.isFlutterwaveV4Enabled);
    setAllowedCurrencies(settings.allowedFlutterwaveCurrencies);
    setAllowedCountries(settings.allowedFlutterwaveCountries);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        isFlutterwaveFundingEnabled: fundingEnabled,
        isFlutterwavePayoutsEnabled: payoutsEnabled,
        isFlutterwaveV4Enabled: v4Enabled,
        allowedFlutterwaveCurrencies: allowedCurrencies,
        allowedFlutterwaveCountries: allowedCountries,
      }).unwrap();
      setMessage('Flutterwave settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Flutterwave settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Flutterwave (Fiat)</h2>
        <p className="leading-relaxed text-muted">
          Controls for the Flutterwave fiat rail -- bank transfer and mobile money funding and
          trainer payouts. Admin approval and provider submission remain separate, manual steps
          regardless of these settings.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="flutterwave-funding-enabled"
            >
              <input
                checked={fundingEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="flutterwave-funding-enabled"
                onChange={(event) => setFundingEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Fiat funding enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off, trainers cannot start a bank/mobile-money deposit checkout.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="flutterwave-payouts-enabled"
            >
              <input
                checked={payoutsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="flutterwave-payouts-enabled"
                onChange={(event) => setPayoutsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Fiat payouts enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off, admins can still approve and manually mark fiat withdrawals paid, but
                  "Submit payout" to Flutterwave is disabled -- keep this off until Flutterwave
                  credentials are configured and tested.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="flutterwave-v4-enabled"
            >
              <input
                checked={v4Enabled}
                className="mt-0.5 size-5 accent-accent"
                id="flutterwave-v4-enabled"
                onChange={(event) => setV4Enabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Use Flutterwave v4 (Customer API)</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Routes new funding/payout-account creation through Flutterwave's current API,
                  which gives trainers real Customer records with proper first/last names. Changes
                  the funding flow -- card is dropped (v4 card charges would require raw card
                  numbers to reach our backend), bank transfer shows a virtual account to pay into
                  instead of a hosted checkout link, and creating a bank/mobile-money payout
                  account additionally registers a Flutterwave Recipient. v3 stays fully available
                  and unaffected while this is off; a deposit/withdrawal created under v4 keeps
                  being serviced by v4 even if this is later switched off.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="flutterwave-allowed-currencies">
              Allowed currencies (CSV)
            </label>
            <input
              className={inputClass}
              id="flutterwave-allowed-currencies"
              onChange={(e) => setAllowedCurrencies(e.target.value)}
              placeholder="NGN,GHS,KES"
              value={allowedCurrencies}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="flutterwave-allowed-countries">
              Allowed countries (CSV, ISO alpha-2)
            </label>
            <input
              className={inputClass}
              id="flutterwave-allowed-countries"
              onChange={(e) => setAllowedCountries(e.target.value)}
              placeholder="NG,GH,KE"
              value={allowedCountries}
            />
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save Flutterwave settings
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
