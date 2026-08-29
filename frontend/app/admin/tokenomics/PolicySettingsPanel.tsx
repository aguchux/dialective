'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetTokenomicsPolicyQuery,
  usePinTokenomicsValueMutation,
  useUnpinTokenomicsValueMutation,
  useUpdateTokenomicsPolicyMutation,
} from '@/store/api';
import { inputClass, primaryButtonClass } from './shared';

export function PolicySettingsPanel() {
  const { data: policy, isLoading } = useGetTokenomicsPolicyQuery();
  const [updatePolicy, { isLoading: isSaving }] = useUpdateTokenomicsPolicyMutation();

  const [valuationIntervalMinutes, setValuationIntervalMinutes] = useState('');
  const [maxIncreaseRate, setMaxIncreaseRate] = useState('');
  const [maxDecreaseRate, setMaxDecreaseRate] = useState('');
  const [healthyCoverageThreshold, setHealthyCoverageThreshold] = useState('');
  const [watchCoverageThreshold, setWatchCoverageThreshold] = useState('');
  const [restrictedCoverageThreshold, setRestrictedCoverageThreshold] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!policy) return;
    setValuationIntervalMinutes(String(policy.valuationIntervalMinutes));
    setMaxIncreaseRate(policy.maxIncreaseRate);
    setMaxDecreaseRate(policy.maxDecreaseRate);
    setHealthyCoverageThreshold(policy.healthyCoverageThreshold);
    setWatchCoverageThreshold(policy.watchCoverageThreshold);
    setRestrictedCoverageThreshold(policy.restrictedCoverageThreshold);
  }, [policy]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const healthy = Number(healthyCoverageThreshold);
    const watch = Number(watchCoverageThreshold);
    const restricted = Number(restrictedCoverageThreshold);
    if (!(healthy >= watch && watch >= restricted)) {
      setError('Coverage thresholds must satisfy healthy >= watch >= restricted.');
      return;
    }

    try {
      await updatePolicy({
        valuationIntervalMinutes: Number(valuationIntervalMinutes),
        maxIncreaseRate: Number(maxIncreaseRate),
        maxDecreaseRate: Number(maxDecreaseRate),
        healthyCoverageThreshold: healthy,
        watchCoverageThreshold: watch,
        restrictedCoverageThreshold: restricted,
      }).unwrap();
      setMessage('Policy saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save the tokenomics policy.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Policy</h2>
        <p className="leading-relaxed text-muted">
          Valuation cadence, max value movement per cycle, and reserve coverage thresholds.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="valuation-interval">
              Valuation interval (minutes)
            </label>
            <input
              className={inputClass}
              id="valuation-interval"
              min="1"
              onChange={(e) => setValuationIntervalMinutes(e.target.value)}
              required
              step="1"
              type="number"
              value={valuationIntervalMinutes}
            />
          </div>
          <div />
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="max-increase-rate">
              Max increase rate (0-1)
            </label>
            <input
              className={inputClass}
              id="max-increase-rate"
              max="1"
              min="0"
              onChange={(e) => setMaxIncreaseRate(e.target.value)}
              required
              step="0.001"
              type="number"
              value={maxIncreaseRate}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="max-decrease-rate">
              Max decrease rate (0-1)
            </label>
            <input
              className={inputClass}
              id="max-decrease-rate"
              max="1"
              min="0"
              onChange={(e) => setMaxDecreaseRate(e.target.value)}
              required
              step="0.001"
              type="number"
              value={maxDecreaseRate}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="healthy-threshold">
              Healthy coverage threshold (0-1)
            </label>
            <input
              className={inputClass}
              id="healthy-threshold"
              max="1"
              min="0"
              onChange={(e) => setHealthyCoverageThreshold(e.target.value)}
              required
              step="0.001"
              type="number"
              value={healthyCoverageThreshold}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="watch-threshold">
              Watch coverage threshold (0-1)
            </label>
            <input
              className={inputClass}
              id="watch-threshold"
              max="1"
              min="0"
              onChange={(e) => setWatchCoverageThreshold(e.target.value)}
              required
              step="0.001"
              type="number"
              value={watchCoverageThreshold}
            />
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs font-bold uppercase text-muted"
              htmlFor="restricted-threshold"
            >
              Restricted coverage threshold (0-1)
            </label>
            <input
              className={inputClass}
              id="restricted-threshold"
              max="1"
              min="0"
              onChange={(e) => setRestrictedCoverageThreshold(e.target.value)}
              required
              step="0.001"
              type="number"
              value={restrictedCoverageThreshold}
            />
          </div>

          {error && (
            <p className="leading-relaxed text-danger sm:col-span-2" role="alert">
              {error}
            </p>
          )}
          {message && <p className="leading-relaxed text-accent sm:col-span-2">{message}</p>}

          <div className="flex justify-end sm:col-span-2">
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save policy
            </ActionButton>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Pinning bypasses the reserve/supply-derived calculation everywhere
 * publishedValueUsd is read (TokenomicsService.getStatus/
 * getCurrentPublishedValue/recalculateValuation) -- withdrawals, minting
 * cost, and every admin/trainer display all see the pinned rate the moment
 * it's set. Separate from PolicySettingsPanel's form since this is a
 * distinct on/off override, not one of the tunable policy fields.
 */
export function PinnedValuePanel() {
  const { data: policy, isLoading } = useGetTokenomicsPolicyQuery();
  const [pin, { isLoading: isPinning }] = usePinTokenomicsValueMutation();
  const [unpin, { isLoading: isUnpinning }] = useUnpinTokenomicsValueMutation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isPinned = policy?.pinnedValueUsd !== null && policy?.pinnedValueUsd !== undefined;

  async function handlePin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setError('Enter a positive DL/USD value to pin.');
      return;
    }
    try {
      await pin(numericValue).unwrap();
      setMessage(`Rate pinned to $${numericValue}.`);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to pin the rate.'));
    }
  }

  async function handleUnpin() {
    setError(null);
    setMessage(null);
    try {
      await unpin().unwrap();
      setValue('');
      setMessage('Rate unpinned -- back to the calculated value.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to unpin the rate.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Pinned rate</h2>
        <p className="leading-relaxed text-muted">
          Overrides the DL/USD rate to a fixed value, bypassing the reserve/supply calculation
          everywhere it&apos;s used (withdrawals, minting cost, displays). Unpin to go back to the
          calculated value.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <>
          {isPinned && policy && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Currently pinned to ${policy.pinnedValueUsd} -- the calculated value is being
              ignored.
            </p>
          )}

          <form className="flex flex-wrap items-end gap-3" onSubmit={handlePin}>
            <div className="grid gap-1">
              <label className="text-xs font-bold uppercase text-muted" htmlFor="pinned-value">
                DL/USD value to pin
              </label>
              <input
                className={`${inputClass} max-w-40`}
                id="pinned-value"
                min="0.00000001"
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.10"
                step="0.00000001"
                type="number"
                value={value}
              />
            </div>
            <ActionButton
              className={primaryButtonClass}
              pending={isPinning}
              pendingLabel="Pinning"
              type="submit"
            >
              {isPinned ? 'Update pin' : 'Pin rate'}
            </ActionButton>
            {isPinned && (
              <ActionButton
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleUnpin}
                pending={isUnpinning}
                pendingLabel="Unpinning"
                type="button"
              >
                Unpin
              </ActionButton>
            )}
          </form>

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          {message && <p className="leading-relaxed text-accent">{message}</p>}
        </>
      )}
    </section>
  );
}
