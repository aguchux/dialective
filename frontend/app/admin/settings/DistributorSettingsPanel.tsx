'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { normalizeErrorMessage, useGetDistributorSettingsQuery, useUpdateDistributorSettingsMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function DistributorSettingsPanel() {
  const { data: settings, isLoading } = useGetDistributorSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateDistributorSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [bulkAllocationEnabled, setBulkAllocationEnabled] = useState(false);
  const [multiLevelReferralEnabled, setMultiLevelReferralEnabled] = useState(false);
  const [defaultBulkDiscountRate, setDefaultBulkDiscountRate] = useState('0.05');
  const [maxReferralDepth, setMaxReferralDepth] = useState('5');
  const [rates, setRates] = useState(['0.05', '0.02', '0.01', '0.002', '0.0003']);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setBulkAllocationEnabled(settings.bulkAllocationEnabled);
    setMultiLevelReferralEnabled(settings.multiLevelReferralEnabled);
    setDefaultBulkDiscountRate(settings.defaultBulkDiscountRate);
    setMaxReferralDepth(String(settings.maxReferralDepth));
    setRates([settings.level1Rate, settings.level2Rate, settings.level3Rate, settings.level4Rate, settings.level5Rate]);
  }, [settings]);

  const totalEnabledRate = useMemo(() => {
    const depth = Number(maxReferralDepth);
    return rates.slice(0, depth).reduce((sum, rate) => sum + Number(rate || 0), 0);
  }, [maxReferralDepth, rates]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        enabled,
        bulkAllocationEnabled,
        multiLevelReferralEnabled,
        defaultBulkDiscountRate: Number(defaultBulkDiscountRate),
        maxReferralDepth: Number(maxReferralDepth),
        level1Rate: Number(rates[0]),
        level2Rate: Number(rates[1]),
        level3Rate: Number(rates[2]),
        level4Rate: Number(rates[3]),
        level5Rate: Number(rates[4]),
      }).unwrap();
      setMessage('Distributor settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save distributor settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Distributor settings</h2>
        <p className="leading-relaxed text-muted">
          Gate distributor dashboards, bulk DL allocations, and multi-level referral bonuses.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          To credit a specific distributor or review their transaction history, go to{' '}
          <Link className="font-bold text-accent hover:text-accent-dark" href="/admin/distributors">
            Distributors
          </Link>
          .
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid max-w-xl gap-4" onSubmit={saveSettings}>
          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <label className="flex items-center gap-2 font-bold">
              <input checked={enabled} onChange={(e) => setEnabled(e.target.checked)} type="checkbox" />
              Enable distributor features
            </label>
            <label className="flex items-center gap-2 font-bold">
              <input checked={bulkAllocationEnabled} onChange={(e) => setBulkAllocationEnabled(e.target.checked)} type="checkbox" />
              Enable admin bulk DL allocations
            </label>
            <label className="flex items-center gap-2 font-bold">
              <input checked={multiLevelReferralEnabled} onChange={(e) => setMultiLevelReferralEnabled(e.target.checked)} type="checkbox" />
              Enable multi-level distributor referral bonuses
            </label>
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <label className="font-bold" htmlFor="bulk-discount">Default bulk discount rate</label>
            <input id="bulk-discount" className={inputClass} min="0" max="1" step="0.0001" type="number" value={defaultBulkDiscountRate} onChange={(e) => setDefaultBulkDiscountRate(e.target.value)} />

            <label className="font-bold" htmlFor="max-depth">Referral depth</label>
            <select id="max-depth" className={inputClass} value={maxReferralDepth} onChange={(e) => setMaxReferralDepth(e.target.value)}>
              {[1, 2, 3, 4, 5].map((depth) => <option key={depth} value={depth}>{depth} level{depth > 1 ? 's' : ''}</option>)}
            </select>

            <div className="grid gap-3 md:grid-cols-5">
              {rates.map((rate, index) => (
                <label className="grid gap-1 text-sm font-bold" key={index}>
                  L{index + 1}
                  <input
                    className={inputClass}
                    min="0"
                    max="1"
                    step="0.0001"
                    type="number"
                    value={rate}
                    onChange={(e) => setRates((current) => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                  />
                </label>
              ))}
            </div>
            <p className={totalEnabledRate > 1 ? 'font-bold text-danger' : 'text-sm text-muted'}>
              Enabled depth total: {(totalEnabledRate * 100).toFixed(2)}%
            </p>
          </div>

          <div>
            <ActionButton className={primaryButtonClass} pending={isSaving} pendingLabel="Saving" type="submit">
              Save distributor settings
            </ActionButton>
          </div>
        </form>
      )}
      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && <p className="leading-relaxed text-danger" role="alert">{error}</p>}
    </section>
  );
}
