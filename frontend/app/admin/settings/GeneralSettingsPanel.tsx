'use client';

import { useEffect, useState } from 'react';
import { normalizeErrorMessage, useGetPlatformSettingsQuery, useUpdatePlatformSettingsMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function GeneralSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [tokenUsdRate, setTokenUsdRate] = useState('');
  const [minWithdrawalTokens, setMinWithdrawalTokens] = useState('');
  const [taskTokenCost, setTaskTokenCost] = useState('');
  const [trainingPayoutBonusCapMultiple, setTrainingPayoutBonusCapMultiple] = useState('');
  const [reverseWordTrainingEnabled, setReverseWordTrainingEnabled] = useState(false);
  const [adminPayoutOtpEnabled, setAdminPayoutOtpEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setTokenUsdRate(settings.tokenUsdRate ?? '');
    setMinWithdrawalTokens(settings.minWithdrawalTokens ?? '');
    setTaskTokenCost(settings.taskTokenCost ?? '');
    setTrainingPayoutBonusCapMultiple(settings.trainingPayoutBonusCapMultiple ?? '');
    setReverseWordTrainingEnabled(settings.reverseWordTrainingEnabled);
    setAdminPayoutOtpEnabled(settings.adminPayoutOtpEnabled);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updateSettings({
        ...(tokenUsdRate !== '' ? { tokenUsdRate: Number(tokenUsdRate) } : {}),
        ...(minWithdrawalTokens !== '' ? { minWithdrawalTokens: Number(minWithdrawalTokens) } : {}),
        ...(taskTokenCost !== '' ? { taskTokenCost: Number(taskTokenCost) } : {}),
        ...(trainingPayoutBonusCapMultiple !== ''
          ? { trainingPayoutBonusCapMultiple: Number(trainingPayoutBonusCapMultiple) }
          : {}),
        reverseWordTrainingEnabled,
        adminPayoutOtpEnabled,
      }).unwrap();
      setMessage('General settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save general settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">General</h2>
        <p className="leading-relaxed text-muted">
          Token economics for the platform wallet. Leave a field blank to use the deployment default.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label className="font-bold" htmlFor="token-usd-rate">
              Token/USD rate
            </label>
            <p className="text-sm leading-relaxed text-muted">USD value of one platform token, e.g. 0.10 = 10 cents.</p>
            <input
              className={inputClass}
              id="token-usd-rate"
              type="number"
              step="0.000001"
              min="0"
              placeholder="Default"
              value={tokenUsdRate}
              onChange={(e) => setTokenUsdRate(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="min-withdrawal">
              Minimum withdrawal (tokens)
            </label>
            <p className="text-sm leading-relaxed text-muted">Smallest token amount a trainer can withdraw at once.</p>
            <input
              className={inputClass}
              id="min-withdrawal"
              type="number"
              step="0.01"
              min="0"
              placeholder="Default"
              value={minWithdrawalTokens}
              onChange={(e) => setMinWithdrawalTokens(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="task-token-cost">
              Task cost (tokens)
            </label>
            <p className="text-sm leading-relaxed text-muted">Tokens debited from a trainer's wallet per submission.</p>
            <input
              className={inputClass}
              id="task-token-cost"
              type="number"
              step="0.01"
              min="0"
              placeholder="Default"
              value={taskTokenCost}
              onChange={(e) => setTaskTokenCost(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="bonus-cap-multiple">
              Training payout bonus cap (multiple of stake)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Caps the score-scaled Reward Pool bonus at this multiple of tokens spent, e.g. 1.0 = up to 1x stake as
              bonus at a perfect score. The trainer always gets tokens spent back regardless of score.
            </p>
            <input
              className={inputClass}
              id="bonus-cap-multiple"
              type="number"
              step="0.01"
              min="0"
              placeholder="Default"
              value={trainingPayoutBonusCapMultiple}
              onChange={(e) => setTrainingPayoutBonusCapMultiple(e.target.value)}
            />
          </div>

          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4" htmlFor="reverse-word-training">
              <input
                checked={reverseWordTrainingEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="reverse-word-training"
                onChange={(event) => setReverseWordTrainingEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Dialect-to-English validation</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Mix translations submitted by other trainers into word sessions for reverse validation and scoring.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4" htmlFor="admin-payout-otp">
              <input
                checked={adminPayoutOtpEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="admin-payout-otp"
                onChange={(event) => setAdminPayoutOtpEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Require OTP for admin payouts</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, issuing a training payout or marking a withdrawal paid requires the acting admin to verify
                  an emailed one-time code first.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton className={primaryButtonClass} type="submit" pending={isSaving} pendingLabel="Saving">
              Save general settings
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
