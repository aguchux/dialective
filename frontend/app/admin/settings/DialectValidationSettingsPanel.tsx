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

/**
 * "Dialect Validation" trainer task -- a trainer listens to a peer's word
 * recording in their own dialect and either picks the word they heard or
 * ticks a problem flag. No token lock/spend like the other tasks; a flat
 * reward is credited per submission instead, only when both this toggle is
 * on and the payout amount below is greater than 0 (see
 * WordValidationService.submit). The flag threshold controls the separate
 * "Misplaced Dialects" admin queue -- see that page for resolving flagged
 * recordings.
 */
export function DialectValidationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [taskEnabled, setTaskEnabled] = useState(false);
  const [payoutTokens, setPayoutTokens] = useState('0');
  const [flagThreshold, setFlagThreshold] = useState('3');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setTaskEnabled(settings.dialectValidationTaskEnabled);
    setPayoutTokens(settings.dialectValidationPayoutTokens ?? '0');
    setFlagThreshold(String(settings.misplacedDialectFlagThreshold));
  }, [settings]);

  const flagThresholdValid = Number(flagThreshold) >= 1;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!flagThresholdValid) {
      setError('Flag threshold must be at least 1.');
      return;
    }

    try {
      await updateSettings({
        dialectValidationTaskEnabled: taskEnabled,
        dialectValidationPayoutTokens: Number(payoutTokens),
        misplacedDialectFlagThreshold: Number(flagThreshold),
      }).unwrap();
      setMessage('Dialect Validation settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Dialect Validation settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Dialect Validation</h2>
        <p className="leading-relaxed text-muted">
          A trainer listens to a peer&apos;s recording in their own dialect and confirms which
          word was said, or flags a problem with it. Recordings flagged as the wrong dialect by
          enough distinct trainers move to the{' '}
          <a className="font-bold text-accent hover:text-accent-dark" href="/admin/misplaced-dialects">
            Misplaced Dialects
          </a>{' '}
          queue for review.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="dialect-validation-task-enabled"
            >
              <input
                checked={taskEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="dialect-validation-task-enabled"
                onChange={(event) => setTaskEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Show the task to trainers</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Whether the &quot;Dialect Validation&quot; card appears in the trainer
                  dashboard. Also gates the per-submission payout below.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="dialect-validation-payout">
              Reward per validation (tokens)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Credited immediately on submit -- no upfront lock, unlike Word training or Domain
              Conversation. Set to 0 to let trainers validate for free with no reward.
            </p>
            <input
              className={`${inputClass} max-w-40`}
              id="dialect-validation-payout"
              min="0"
              onChange={(e) => setPayoutTokens(e.target.value)}
              step="0.1"
              type="number"
              value={payoutTokens}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="dialect-validation-flag-threshold">
              Wrong-dialect flag threshold
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Distinct trainers who must tick &quot;wrong dialect&quot; on the same recording
              before it moves to the Misplaced Dialects admin queue.
            </p>
            <input
              className={`${inputClass} max-w-40`}
              id="dialect-validation-flag-threshold"
              min="1"
              onChange={(e) => setFlagThreshold(e.target.value)}
              step="1"
              type="number"
              value={flagThreshold}
            />
            {!flagThresholdValid && (
              <p className="text-sm font-bold text-danger">Must be at least 1.</p>
            )}
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              disabled={!flagThresholdValid}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save Dialect Validation settings
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
