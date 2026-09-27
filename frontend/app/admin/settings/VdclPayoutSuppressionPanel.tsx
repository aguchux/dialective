'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useApplyVdclSuppressionMutation,
  useGetPlatformSettingsQuery,
  useRequestVdclSuppressionOtpMutation,
} from '@/store/api';

const cardClass = 'rounded-xl border border-line bg-surface';
const fieldClass =
  'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent';

/**
 * Stop charging and paying trainers who hold an active VDCL.
 *
 * Separate from the Training economy panel above it, because the two have
 * different blast radii and an admin needs to see that clearly: that one stops
 * money for every trainer at once, this one only for contributors who have
 * signed a licence. Everyone else keeps staking and earning.
 *
 * The warning is the point of this panel. Stream revenue sharing does not pay
 * out yet, so turning this on means a signed contributor records for no
 * compensation from any source until it does. That is a real gap, not a
 * theoretical one, and the panel says so rather than leaving an admin to
 * discover it from trainer complaints.
 */
export function VdclPayoutSuppressionPanel() {
  const { data: settings } = useGetPlatformSettingsQuery();
  const [applySuppression, { isLoading: isSaving }] = useApplyVdclSuppressionMutation();
  const [requestOtp, { isLoading: isRequesting }] = useRequestVdclSuppressionOtpMutation();

  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Defaults false, matching the column default -- the gate ships off.
  const current = settings?.vdclPayoutSuppressionEnabled ?? false;
  // The direction a confirmed code would apply, captured when the code is
  // requested so the button cannot silently change meaning if the underlying
  // setting is refreshed mid-flow.
  const [pendingDirection, setPendingDirection] = useState<boolean | null>(null);

  useEffect(() => {
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
      await applySuppression({
        enabled: target,
        otpRequestId: otpRequestId ?? undefined,
        code: code.trim() || undefined,
      }).unwrap();
      setMessage(
        target
          ? 'Licensed contributors now record without a stake and without a DL payout.'
          : 'Licensed contributors are back on the normal stake-and-payout model.',
      );
      setOtpRequestId(null);
      setCode('');
      setPendingDirection(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not change contributor payouts.'));
    }
  }

  return (
    <section className={`${cardClass} p-5 md:p-6`}>
      <h2 className="text-xl font-black">Licensed contributor payouts</h2>
      <p className="mt-2 leading-relaxed text-muted">
        Whether trainers who hold an active Voice Dataset Contributor Licence are charged to record
        and paid on settlement. Turning this off moves them to Stream revenue sharing instead.
        Trainers without a licence are never affected by this setting.
      </p>

      <div
        className={`mt-5 flex items-center gap-3 rounded-lg p-4 ${
          current
            ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
        }`}
      >
        <span
          className={`size-2.5 shrink-0 rounded-full ${current ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
        <span className="font-bold">
          {current
            ? 'Suppressed — licensed contributors record for no stake and no DL'
            : 'Normal — every trainer is charged to record and paid on settlement'}
        </span>
      </div>

      {!current ? (
        <div className="mt-5 flex gap-2.5 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-extrabold">
              Stream revenue sharing does not pay out yet.
            </strong>{' '}
            Turning this on stops DL payouts for signed contributors before the replacement exists,
            so they would record for no compensation from any source. Wait until revenue sharing is
            live. Balances already earned are untouched either way.
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
            {current ? 'Resume payouts for licensed contributors' : 'Stop payouts for licensed contributors'}
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
                {target ? 'Confirm stop' : 'Confirm resume'}
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
