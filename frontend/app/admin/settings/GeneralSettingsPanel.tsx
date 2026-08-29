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

export function GeneralSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [tokenUsdRate, setTokenUsdRate] = useState('');
  const [minWithdrawalTokens, setMinWithdrawalTokens] = useState('');
  const [minCompletedTasksForWithdrawal, setMinCompletedTasksForWithdrawal] = useState('');
  const [taskTokenCost, setTaskTokenCost] = useState('');
  const [trainingPayoutBonusCapMultiple, setTrainingPayoutBonusCapMultiple] = useState('');
  const [reverseWordTrainingEnabled, setReverseWordTrainingEnabled] = useState(false);
  const [sentenceRebuildEnabled, setSentenceRebuildEnabled] = useState(false);
  const [adminPayoutOtpEnabled, setAdminPayoutOtpEnabled] = useState(false);
  const [phoneVerificationRequired, setPhoneVerificationRequired] = useState(true);
  const [startupBonusAmount, setStartupBonusAmount] = useState('');
  const [wordStuckTimeoutMinutes, setWordStuckTimeoutMinutes] = useState('');
  const [scoringSlaMinutes, setScoringSlaMinutes] = useState('');
  const [settlementDelayMinutes, setSettlementDelayMinutes] = useState('');
  const [noFailOnTrainEnabled, setNoFailOnTrainEnabled] = useState(false);
  const [minScoreRange, setMinScoreRange] = useState('');
  const [maxScoreRange, setMaxScoreRange] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setTokenUsdRate(settings.tokenUsdRate ?? '');
    setMinWithdrawalTokens(settings.minWithdrawalTokens ?? '');
    setMinCompletedTasksForWithdrawal(
      settings.minCompletedTasksForWithdrawal !== null
        ? String(settings.minCompletedTasksForWithdrawal)
        : '',
    );
    setTaskTokenCost(settings.taskTokenCost ?? '');
    setTrainingPayoutBonusCapMultiple(settings.trainingPayoutBonusCapMultiple ?? '');
    setReverseWordTrainingEnabled(settings.reverseWordTrainingEnabled);
    setSentenceRebuildEnabled(settings.sentenceRebuildEnabled);
    setAdminPayoutOtpEnabled(settings.adminPayoutOtpEnabled);
    setPhoneVerificationRequired(settings.phoneVerificationRequired);
    setStartupBonusAmount(settings.startupBonusAmount ?? '');
    setWordStuckTimeoutMinutes(String(settings.wordStuckTimeoutMinutes));
    setScoringSlaMinutes(String(settings.scoringSlaMinutes));
    setSettlementDelayMinutes(String(settings.settlementDelayMinutes));
    setNoFailOnTrainEnabled(settings.noFailOnTrainEnabled);
    setMinScoreRange(settings.minScoreRange);
    setMaxScoreRange(settings.maxScoreRange);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (
      minScoreRange !== '' &&
      maxScoreRange !== '' &&
      Number(minScoreRange) > Number(maxScoreRange)
    ) {
      setError('Minimum score range cannot be greater than the maximum.');
      return;
    }

    try {
      await updateSettings({
        ...(tokenUsdRate !== '' ? { tokenUsdRate: Number(tokenUsdRate) } : {}),
        ...(minWithdrawalTokens !== '' ? { minWithdrawalTokens: Number(minWithdrawalTokens) } : {}),
        ...(minCompletedTasksForWithdrawal !== ''
          ? { minCompletedTasksForWithdrawal: Number(minCompletedTasksForWithdrawal) }
          : {}),
        ...(taskTokenCost !== '' ? { taskTokenCost: Number(taskTokenCost) } : {}),
        ...(trainingPayoutBonusCapMultiple !== ''
          ? { trainingPayoutBonusCapMultiple: Number(trainingPayoutBonusCapMultiple) }
          : {}),
        reverseWordTrainingEnabled,
        sentenceRebuildEnabled,
        adminPayoutOtpEnabled,
        phoneVerificationRequired,
        ...(startupBonusAmount !== '' ? { startupBonusAmount: Number(startupBonusAmount) } : {}),
        ...(wordStuckTimeoutMinutes !== ''
          ? { wordStuckTimeoutMinutes: Number(wordStuckTimeoutMinutes) }
          : {}),
        ...(scoringSlaMinutes !== '' ? { scoringSlaMinutes: Number(scoringSlaMinutes) } : {}),
        ...(settlementDelayMinutes !== ''
          ? { settlementDelayMinutes: Number(settlementDelayMinutes) }
          : {}),
        noFailOnTrainEnabled,
        ...(minScoreRange !== '' ? { minScoreRange: Number(minScoreRange) } : {}),
        ...(maxScoreRange !== '' ? { maxScoreRange: Number(maxScoreRange) } : {}),
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
          DL economics for the platform wallet. Leave a field blank to use the deployment default.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label className="font-bold" htmlFor="token-usd-rate">
              DL/USD rate
            </label>
            <p className="text-sm leading-relaxed text-muted">
              USD value of one DL, e.g. 0.10 = 10 cents.
            </p>
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
              Minimum withdrawal (DL)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Smallest DL amount a trainer can withdraw at once.
            </p>
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
            <label className="font-bold" htmlFor="min-completed-tasks">
              Minimum completed tasks (default 100)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Trainer must have this many settled (paid) submissions + word recordings before any
              withdrawal, fiat or crypto, is allowed.
            </p>
            <input
              className={inputClass}
              id="min-completed-tasks"
              type="number"
              step="1"
              min="0"
              placeholder="100"
              value={minCompletedTasksForWithdrawal}
              onChange={(e) => setMinCompletedTasksForWithdrawal(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="task-token-cost">
              Task cost (DL)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              DL debited from a trainer's wallet per submission.
            </p>
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
            <label className="font-bold" htmlFor="startup-bonus-amount">
              Startup bonus (DL)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              One-time DL credit granted automatically the first time a user verifies their email.
              Leave blank or 0 to turn it off.
            </p>
            <input
              className={inputClass}
              id="startup-bonus-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Off"
              value={startupBonusAmount}
              onChange={(e) => setStartupBonusAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="bonus-cap-multiple">
              Training payout bonus cap (multiple of stake)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Caps the score-scaled Reward Pool bonus at this multiple of DL spent, e.g. 1.0 = up to
              1x stake as bonus at a perfect score. The trainer always gets DL spent back regardless
              of score.
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

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="word-stuck-timeout-minutes">
              Unmatched word recording timeout (minutes)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              How long a dialect-to-English word recording can wait for peer reverse-validation
              before its held DL is automatically returned to the trainer's balance.
            </p>
            <input
              className={inputClass}
              id="word-stuck-timeout-minutes"
              type="number"
              step="1"
              min="1"
              value={wordStuckTimeoutMinutes}
              onChange={(e) => setWordStuckTimeoutMinutes(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="scoring-sla-minutes">
              Scoring time limit (minutes)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              How long a submitted task can wait for consensus scoring before it's resolved
              automatically -- either refunded (below) or, if "Pay on timeout" is on, paid out at a
              random score.
            </p>
            <input
              className={inputClass}
              id="scoring-sla-minutes"
              type="number"
              step="1"
              min="1"
              value={scoringSlaMinutes}
              onChange={(e) => setScoringSlaMinutes(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="settlement-delay-minutes">
              Settlement delay (minutes)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              How long to wait after a task is scored before crediting the payout to the trainer's
              balance -- a review window for catching issues before DL moves. 0 settles as soon as
              scoring completes; set well past 1440 (24 hours) for a longer hold.
            </p>
            <input
              className={inputClass}
              id="settlement-delay-minutes"
              type="number"
              step="1"
              min="0"
              value={settlementDelayMinutes}
              onChange={(e) => setSettlementDelayMinutes(e.target.value)}
            />
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="no-fail-on-train"
            >
              <input
                checked={noFailOnTrainEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="no-fail-on-train"
                onChange={(event) => setNoFailOnTrainEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Pay on timeout (no fail on train)</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, a task still unscored past the scoring time limit is paid out at a random
                  score within the range below instead of just being refunded -- the trainer
                  completed and submitted real work, so they're paid for it even if
                  consensus/reverse-validation never resolves.
                </span>
              </span>
            </label>
          </div>

          {noFailOnTrainEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label className="font-bold" htmlFor="min-score-range">
                  Min score (%)
                </label>
                <input
                  className={inputClass}
                  id="min-score-range"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={minScoreRange}
                  onChange={(e) => setMinScoreRange(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="font-bold" htmlFor="max-score-range">
                  Max score (%)
                </label>
                <input
                  className={inputClass}
                  id="max-score-range"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={maxScoreRange}
                  onChange={(e) => setMaxScoreRange(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="reverse-word-training"
            >
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
                  Mix translations submitted by other trainers into word sessions for reverse
                  validation and scoring.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="sentence-rebuild"
            >
              <input
                checked={sentenceRebuildEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="sentence-rebuild"
                onChange={(event) => setSentenceRebuildEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Sentence rebuild exercise</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Mix in a tap-the-fragments-in-order sentence exercise during word sessions, using
                  classified word sequences generated for each prompt. Requires part-of-speech
                  classification and segmentation to be populated for at least some prompts.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="admin-payout-otp"
            >
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
                  When on, issuing a training payout or marking a withdrawal paid requires the
                  acting admin to verify an emailed one-time code first.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="phone-verification-required"
            >
              <input
                checked={phoneVerificationRequired}
                className="mt-0.5 size-5 accent-accent"
                id="phone-verification-required"
                onChange={(event) => setPhoneVerificationRequired(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Require phone verification</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on (default), trainers must verify their phone by SMS before requesting a
                  withdrawal or trading on the P2P market. When off, phone numbers can be saved
                  without SMS verification, and withdrawals and P2P trading fall back to an emailed
                  one-time code instead -- withdrawals already require this email code regardless of
                  this setting.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
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
