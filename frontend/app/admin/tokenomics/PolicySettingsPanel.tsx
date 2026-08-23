'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetTokenomicsPolicyQuery,
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
