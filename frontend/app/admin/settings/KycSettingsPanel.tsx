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

export function KycSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [requiredForWithdrawals, setRequiredForWithdrawals] = useState(false);
  const [minWithdrawalTokens, setMinWithdrawalTokens] = useState('0');
  const [requiredOnboarding, setRequiredOnboarding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setRequiredForWithdrawals(settings.isKycRequiredForWithdrawals);
    setMinWithdrawalTokens(settings.kycMinWithdrawalTokens);
    setRequiredOnboarding(settings.isKycRequiredOnboarding);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        isKycRequiredForWithdrawals: requiredForWithdrawals,
        kycMinWithdrawalTokens: Number(minWithdrawalTokens) || 0,
        isKycRequiredOnboarding: requiredOnboarding,
      }).unwrap();
      setMessage('Identity verification settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save identity verification settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Identity Verification (Didit)</h2>
        <p className="leading-relaxed text-muted">
          Controls for AI KYC verification -- ID scan, selfie, and face-match via Didit. When
          required, a trainer must reach APPROVED status before a withdrawal at or above the
          threshold below is allowed. Verification results are decided by Didit; admins only get an
          oversight queue.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="kyc-required-onboarding"
            >
              <input
                checked={requiredOnboarding}
                className="mt-0.5 size-5 accent-accent"
                id="kyc-required-onboarding"
                onChange={(event) => setRequiredOnboarding(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Prompt during onboarding</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  A trainer is prompted to verify right after completing onboarding, with a "Do this
                  later" option. Skipping has no effect beyond the withdrawal rule below -- there is
                  no separate onboarding-only lock.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="kyc-required-for-withdrawals"
            >
              <input
                checked={requiredForWithdrawals}
                className="mt-0.5 size-5 accent-accent"
                id="kyc-required-for-withdrawals"
                onChange={(event) => setRequiredForWithdrawals(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Required for withdrawals</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off, withdrawals are unaffected -- keep this off until Didit credentials are
                  configured and tested.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="kyc-min-withdrawal-tokens">
              Minimum withdrawal tokens requiring verification
            </label>
            <input
              className={inputClass}
              id="kyc-min-withdrawal-tokens"
              inputMode="decimal"
              onChange={(e) => setMinWithdrawalTokens(e.target.value)}
              placeholder="0"
              value={minWithdrawalTokens}
            />
            <p className="text-sm leading-relaxed text-muted">
              Withdrawals below this amount skip the KYC gate even when required above is on. Set to
              0 to require verification for every withdrawal.
            </p>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save identity verification settings
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
