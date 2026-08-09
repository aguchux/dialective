'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  normalizeErrorMessage,
  useGetReferralSettingsQuery,
  useGetReferralsQuery,
  useUpdateReferralSettingsMutation,
} from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminReferralsPage() {
  const [fundingBonusRate, setFundingBonusRate] = useState('0.10');
  const [fundingBonusEnabled, setFundingBonusEnabled] = useState(true);
  const [payoutBonusRate, setPayoutBonusRate] = useState('0.00');
  const [payoutBonusEnabled, setPayoutBonusEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: settings, isLoading: isLoadingSettings } = useGetReferralSettingsQuery();
  const { data: referrals, isLoading: isLoadingReferrals } = useGetReferralsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateReferralSettingsMutation();

  useEffect(() => {
    if (!settings) return;
    setFundingBonusRate(settings.fundingBonusRate);
    setFundingBonusEnabled(settings.fundingBonusEnabled);
    setPayoutBonusRate(settings.payoutBonusRate);
    setPayoutBonusEnabled(settings.payoutBonusEnabled);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updateSettings({
        fundingBonusRate: Number(fundingBonusRate),
        fundingBonusEnabled,
        payoutBonusRate: Number(payoutBonusRate),
        payoutBonusEnabled,
      }).unwrap();
      setMessage('Referral bonus settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save referral settings.'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Referral bonuses</h1>
          <p className="leading-relaxed text-muted">
            Set the fixed platform referral bonuses. A rate of 0 or a disabled toggle prevents that bonus from being applied.
          </p>
        </div>

        <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <h2 className="text-2xl leading-snug">Bonus settings</h2>
          {isLoadingSettings && <p className="text-muted">Loading...</p>}
          {!isLoadingSettings && (
            <form className="grid gap-4 md:max-w-xl" onSubmit={handleSave}>
              <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
                <label className="flex items-center gap-2 font-bold" htmlFor="funding-enabled">
                  <input
                    id="funding-enabled"
                    type="checkbox"
                    checked={fundingBonusEnabled}
                    onChange={(e) => setFundingBonusEnabled(e.target.checked)}
                  />
                  Token funding referral bonus
                </label>
                <p className="leading-relaxed text-muted">
                  Paid to the referrer when an invited user&apos;s token funding payment is confirmed.
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
                  Deducted from an invited user&apos;s scored training payout and remitted to the referrer.
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

              <div>
                <button className={primaryButtonClass} type="submit" disabled={isSaving}>
                  Save settings
                </button>
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

        <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <h2 className="text-2xl leading-snug">Referrers</h2>
          {isLoadingReferrals && <p className="text-muted">Loading...</p>}
          {referrals && referrals.length === 0 && <p className="text-muted">No referral bonuses yet.</p>}
          {referrals && referrals.length > 0 && (
            <div className="grid gap-2">
              {referrals.map((r) => (
                <div className="grid gap-1 rounded-lg border border-line bg-surface p-4" key={r.referralCode}>
                  <p className="font-extrabold">{r.referrerEmail}</p>
                  <p className="text-sm text-muted">
                    {r.referredUsers.length} referred &middot; {r.bonusEventCount} bonus events &middot; earned{' '}
                    {r.totalCommission} tokens
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
