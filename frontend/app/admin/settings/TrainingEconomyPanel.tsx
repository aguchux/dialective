'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useRequestTrainingEconomyOtpMutation,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';

const cardClass = 'rounded-xl border border-line bg-surface';
const fieldClass =
  'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent';

/**
 * The switch from the task-and-withdrawal model to VDCL/Stream.
 *
 * Its own section rather than a checkbox in the General panel's bulk save,
 * because it is the one setting on that page that starts or stops money
 * moving for every trainer at once. It carries a confirmation code, and the
 * button that applies it does not exist until a code has been issued -- so
 * a stray click is harmless rather than merely discouraged.
 *
 * Deliberately says what it does NOT do. Switching the economy off does not
 * settle, reduce or convert any balance a trainer has already earned; those
 * are reconciled separately. An admin reading this panel should not be left
 * to infer that.
 */
export function TrainingEconomyPanel() {
  const { data: settings } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();
  const [requestOtp, { isLoading: isRequesting }] = useRequestTrainingEconomyOtpMutation();

  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = settings?.trainingEconomyEnabled ?? true;
  // The direction a confirmed code would apply. Captured when the code is
  // requested so the button cannot silently change meaning if the underlying
  // setting is refreshed mid-flow.
  const [pendingDirection, setPendingDirection] = useState<boolean | null>(null);

  useEffect(() => {
    // A settings refresh that already reflects the change clears the flow.
    if (pendingDirection !== null && current === pendingDirection) {
      setOtpRequestId(null);
      setCode('');
      setPendingDirection(null);
    }
  }, [current, pendingDirection]);

  const target = !current;

  async function handleRequestCode() {
    setMessage(null);
    setError(null);
    try {
      const result = await requestOtp({ enabling: target }).unwrap();
      setOtpRequestId(result.otpRequestId);
      setPendingDirection(target);
      setMessage('Confirmation code sent to your email.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send a confirmation code.'));
    }
  }

  async function handleApply() {
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        trainingEconomyEnabled: target,
        trainingEconomyOtpRequestId: otpRequestId ?? undefined,
        trainingEconomyOtpCode: code.trim() || undefined,
      }).unwrap();
      setMessage(
        target
          ? 'Training payouts resumed. New recordings will take a stake and pay out again.'
          : 'Training payouts stopped. Recording is now free and earns no DL.',
      );
      setOtpRequestId(null);
      setCode('');
      setPendingDirection(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not change the training economy.'));
    }
  }

  return (
    <section className={`${cardClass} p-5 md:p-6`}>
      <h2 className="text-xl font-black">Training economy</h2>
      <p className="mt-2 leading-relaxed text-muted">
        The stake-and-payout model: submitting a recording locks{' '}
        {settings?.taskTokenCost ?? 'the task cost'} DL from the trainer&apos;s wallet, and
        settlement returns that stake plus a score-scaled bonus.
      </p>

      <div
        className={`mt-5 flex items-center gap-3 rounded-lg p-4 ${
          current
            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            : 'bg-surface-muted text-muted'
        }`}
      >
        <span
          className={`size-2.5 shrink-0 rounded-full ${current ? 'bg-emerald-500' : 'bg-muted'}`}
        />
        <span className="font-bold">
          {current
            ? 'Running — trainers are charged to record and paid on settlement'
            : 'Stopped — recording is free and earns no DL'}
        </span>
      </div>

      {current ? (
        <div className="mt-5 flex gap-2.5 rounded-lg bg-surface-muted p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Stopping this ends the task-and-withdrawal model platform-wide, from the moment it is
            applied. Recording, scoring and validation keep working exactly as now — only the money
            stops. It does <strong className="font-extrabold">not</strong> settle, reduce or convert
            any balance a trainer has already earned; those are reconciled separately. Recordings
            that already hold a stake still settle and release normally.
          </span>
        </div>
      ) : null}

      <div className="mt-5 border-t border-line pt-5">
        {!otpRequestId ? (
          <ActionButton
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 font-extrabold hover:border-accent"
            pending={isRequesting}
            onClick={handleRequestCode}
            type="button"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {current ? 'Stop training payouts' : 'Resume training payouts'}
          </ActionButton>
        ) : (
          <div className="grid gap-3 sm:max-w-sm">
            <label className="grid gap-1.5">
              <span className="text-sm font-bold">Confirmation code</span>
              <input
                autoComplete="one-time-code"
                className={fieldClass}
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                placeholder="6-digit code"
                value={code}
              />
            </label>
            <div className="flex flex-wrap gap-2.5">
              <ActionButton
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark disabled:opacity-50"
                disabled={code.trim().length === 0}
                pending={isSaving}
                onClick={handleApply}
                type="button"
              >
                {target ? 'Confirm resume' : 'Confirm stop'}
              </ActionButton>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-extrabold hover:border-accent"
                onClick={() => {
                  setOtpRequestId(null);
                  setCode('');
                  setPendingDirection(null);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {message ? <p className="mt-4 text-sm font-bold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-bold text-red-600">{error}</p> : null}
    </section>
  );
}
