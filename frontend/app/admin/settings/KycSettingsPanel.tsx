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
  const [manualPhoneVerificationEnabled, setManualPhoneVerificationEnabled] = useState(true);
  const [manualPhoneVerificationFeeTokens, setManualPhoneVerificationFeeTokens] = useState('1');
  const [manualPhoneVerificationWhatsappNumber, setManualPhoneVerificationWhatsappNumber] =
    useState('');
  const [manualPhoneVerificationExpiryMinutes, setManualPhoneVerificationExpiryMinutes] =
    useState('30');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setRequiredForWithdrawals(settings.isKycRequiredForWithdrawals);
    setMinWithdrawalTokens(settings.kycMinWithdrawalTokens);
    setRequiredOnboarding(settings.isKycRequiredOnboarding);
    setManualPhoneVerificationEnabled(settings.manualPhoneVerificationEnabled);
    setManualPhoneVerificationFeeTokens(settings.manualPhoneVerificationFeeTokens);
    setManualPhoneVerificationWhatsappNumber(settings.manualPhoneVerificationWhatsappNumber);
    setManualPhoneVerificationExpiryMinutes(
      String(settings.manualPhoneVerificationExpiryMinutes),
    );
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const expiryMinutes = Number(manualPhoneVerificationExpiryMinutes);
    if (!Number.isInteger(expiryMinutes) || expiryMinutes < 1 || expiryMinutes > 1440) {
      setError('Manual WhatsApp code expiry must be a whole number between 1 and 1,440 minutes.');
      return;
    }
    try {
      await updateSettings({
        isKycRequiredForWithdrawals: requiredForWithdrawals,
        kycMinWithdrawalTokens: Number(minWithdrawalTokens) || 0,
        isKycRequiredOnboarding: requiredOnboarding,
        manualPhoneVerificationEnabled,
        manualPhoneVerificationFeeTokens: Number(manualPhoneVerificationFeeTokens) || 0,
        manualPhoneVerificationWhatsappNumber,
        manualPhoneVerificationExpiryMinutes: expiryMinutes,
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

          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="manual-phone-verification"
            >
              <input
                checked={manualPhoneVerificationEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="manual-phone-verification"
                onChange={(event) => setManualPhoneVerificationEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Allow manual WhatsApp phone verification</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Trainers receive a code to send to your WhatsApp number when SMS delivery fails.
                  The code is only valid for the duration set below, and the DL fee is charged only
                  after an admin verifies it.
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold" htmlFor="manual-phone-whatsapp">
                WhatsApp number
                <input
                  className={inputClass}
                  id="manual-phone-whatsapp"
                  maxLength={40}
                  onChange={(event) => setManualPhoneVerificationWhatsappNumber(event.target.value)}
                  placeholder="1234567890"
                  value={manualPhoneVerificationWhatsappNumber}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="manual-phone-fee">
                Manual verification fee (DL)
                <input
                  className={inputClass}
                  id="manual-phone-fee"
                  min="0"
                  onChange={(event) => setManualPhoneVerificationFeeTokens(event.target.value)}
                  step="0.01"
                  type="number"
                  value={manualPhoneVerificationFeeTokens}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="manual-phone-expiry">
                Code expiry (minutes)
                <input
                  className={inputClass}
                  id="manual-phone-expiry"
                  inputMode="numeric"
                  max="1440"
                  min="1"
                  onChange={(event) => setManualPhoneVerificationExpiryMinutes(event.target.value)}
                  type="number"
                  value={manualPhoneVerificationExpiryMinutes}
                />
              </label>
            </div>
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
