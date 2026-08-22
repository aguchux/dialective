'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useGetReferralSettingsQuery,
  useUpdatePlatformSettingsMutation,
  useUpdateReferralSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function ReferralBonusSettingsPanel() {
  const [fundingBonusRate, setFundingBonusRate] = useState('0.10');
  const [fundingBonusEnabled, setFundingBonusEnabled] = useState(true);
  const [payoutBonusRate, setPayoutBonusRate] = useState('0.00');
  const [payoutBonusEnabled, setPayoutBonusEnabled] = useState(false);
  const [cookiePersistSeconds, setCookiePersistSeconds] = useState('86400');
  const [inviteExpirySeconds, setInviteExpirySeconds] = useState('86400');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: settings, isLoading: isLoadingSettings } = useGetReferralSettingsQuery();
  const { data: platformSettings, isLoading: isLoadingPlatformSettings } =
    useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSavingReferral }] = useUpdateReferralSettingsMutation();
  const [updatePlatformSettings, { isLoading: isSavingPlatform }] =
    useUpdatePlatformSettingsMutation();

  const isSaving = isSavingReferral || isSavingPlatform;

  useEffect(() => {
    if (!settings) return;
    setFundingBonusRate(settings.fundingBonusRate);
    setFundingBonusEnabled(settings.fundingBonusEnabled);
    setPayoutBonusRate(settings.payoutBonusRate);
    setPayoutBonusEnabled(settings.payoutBonusEnabled);
  }, [settings]);

  useEffect(() => {
    if (!platformSettings) return;
    setCookiePersistSeconds(String(platformSettings.referralCookiePersistSeconds));
    setInviteExpirySeconds(String(platformSettings.referralInviteExpirySeconds));
  }, [platformSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await Promise.all([
        updateSettings({
          fundingBonusRate: Number(fundingBonusRate),
          fundingBonusEnabled,
          payoutBonusRate: Number(payoutBonusRate),
          payoutBonusEnabled,
        }).unwrap(),
        updatePlatformSettings({
          referralCookiePersistSeconds: Number(cookiePersistSeconds),
          referralInviteExpirySeconds: Number(inviteExpirySeconds),
        }).unwrap(),
      ]);
      setMessage('Referral bonus settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save referral settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Referral bonuses</h2>
        <p className="leading-relaxed text-muted">
          Set the fixed platform referral bonuses. A rate of 0 or a disabled toggle prevents that
          bonus from being applied.
        </p>
      </div>

      {(isLoadingSettings || isLoadingPlatformSettings) && <p className="text-muted">Loading...</p>}
      {!isLoadingSettings && !isLoadingPlatformSettings && (
        <form className="grid gap-4 md:max-w-xl" onSubmit={handleSave}>
          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <label className="flex items-center gap-2 font-bold" htmlFor="funding-enabled">
              <input
                id="funding-enabled"
                type="checkbox"
                checked={fundingBonusEnabled}
                onChange={(e) => setFundingBonusEnabled(e.target.checked)}
              />
              DL funding referral bonus
            </label>
            <p className="leading-relaxed text-muted">
              Paid to the referrer when an invited user&apos;s DL funding payment is confirmed.
            </p>
            <label htmlFor="funding-rate">Fractional rate, e.g. 0.10 = 10%</label>
            <input
              className={inputClass}
              id="funding-rate"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              value={fundingBonusRate}
              onChange={(e) => setFundingBonusRate(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <label className="flex items-center gap-2 font-bold" htmlFor="payout-enabled">
              <input
                id="payout-enabled"
                type="checkbox"
                checked={payoutBonusEnabled}
                onChange={(e) => setPayoutBonusEnabled(e.target.checked)}
              />
              Training payout referral bonus
            </label>
            <p className="leading-relaxed text-muted">
              Deducted from an invited user&apos;s scored training payout and remitted to the
              referrer.
            </p>
            <label htmlFor="payout-rate">Fractional rate, e.g. 0.05 = 5%</label>
            <input
              className={inputClass}
              id="payout-rate"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              value={payoutBonusRate}
              onChange={(e) => setPayoutBonusRate(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <p className="font-bold">Referral lifecycle</p>
            <p className="leading-relaxed text-muted">
              Controls previously hardcoded in frontend/backend constants and deployment env vars.
            </p>

            <label htmlFor="cookie-persist-seconds">Referral cookie persist time (seconds)</label>
            <input
              className={inputClass}
              id="cookie-persist-seconds"
              type="number"
              step="1"
              min="60"
              value={cookiePersistSeconds}
              onChange={(e) => setCookiePersistSeconds(e.target.value)}
              required
            />

            <label htmlFor="invite-expiry-seconds">Invitation expiry time (seconds)</label>
            <input
              className={inputClass}
              id="invite-expiry-seconds"
              type="number"
              step="1"
              min="300"
              value={inviteExpirySeconds}
              onChange={(e) => setInviteExpirySeconds(e.target.value)}
              required
            />
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save settings
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
