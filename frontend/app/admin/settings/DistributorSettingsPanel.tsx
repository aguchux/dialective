'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  normalizeErrorMessage,
  useCreateDistributorAllocationMutation,
  useGetDistributorSettingsQuery,
  useGetUsersQuery,
  useListDistributorAllocationsQuery,
  useUpdateDistributorSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function DistributorSettingsPanel() {
  const { data: settings, isLoading } = useGetDistributorSettingsQuery();
  const { data: distributors } = useGetUsersQuery({ role: 'DISTRIBUTOR' });
  const { data: allocationHistory, isLoading: isLoadingHistory } = useListDistributorAllocationsQuery({ pageSize: 20 });
  const [updateSettings, { isLoading: isSaving }] = useUpdateDistributorSettingsMutation();
  const [allocate, { isLoading: isAllocating }] = useCreateDistributorAllocationMutation();

  const [enabled, setEnabled] = useState(false);
  const [bulkAllocationEnabled, setBulkAllocationEnabled] = useState(false);
  const [multiLevelReferralEnabled, setMultiLevelReferralEnabled] = useState(false);
  const [defaultBulkDiscountRate, setDefaultBulkDiscountRate] = useState('0.05');
  const [maxReferralDepth, setMaxReferralDepth] = useState('5');
  const [rates, setRates] = useState(['0.05', '0.02', '0.01', '0.002', '0.0003']);
  const [selectedDistributorId, setSelectedDistributorId] = useState('');
  const [tokenAmount, setTokenAmount] = useState('1000000');
  const [discountRate, setDiscountRate] = useState('');
  const [note, setNote] = useState('');
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

  useEffect(() => {
    if (!selectedDistributorId && distributors?.[0]) {
      setSelectedDistributorId(distributors[0].id);
    }
  }, [distributors, selectedDistributorId]);

  const totalEnabledRate = useMemo(() => {
    const depth = Number(maxReferralDepth);
    return rates.slice(0, depth).reduce((sum, rate) => sum + Number(rate || 0), 0);
  }, [maxReferralDepth, rates]);

  // Purely informational -- the discount here is a record of the deal admin
  // struck with the distributor (e.g. for off-platform invoicing), not a
  // charge collected on-platform. The full tokenAmount is always credited
  // to the distributor's wallet regardless of this number; this readout
  // exists so the admin sees exactly what "5% off 1,000,000 DL" implies
  // before submitting, rather than the discount being an invisible field.
  const effectiveTokenAmount = useMemo(() => {
    const amount = Number(tokenAmount || 0);
    const rate = Number((discountRate || defaultBulkDiscountRate) || 0);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, rate, discountedValue: amount * (1 - rate) };
  }, [tokenAmount, discountRate, defaultBulkDiscountRate]);

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

  async function createAllocation(e: FormEvent) {
    e.preventDefault();
    if (!selectedDistributorId) return;
    setMessage(null);
    setError(null);
    try {
      await allocate({
        distributorId: selectedDistributorId,
        tokenAmount: Number(tokenAmount),
        discountRate: discountRate ? Number(discountRate) : undefined,
        note: note.trim() || undefined,
      }).unwrap();
      setMessage('Bulk DL allocation credited.');
      setNote('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to allocate DL tokens.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Distributor settings</h2>
        <p className="leading-relaxed text-muted">
          Gate distributor dashboards, bulk DL allocations, and multi-level referral bonuses.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <form className="grid gap-4" onSubmit={saveSettings}>
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

            <ActionButton className={primaryButtonClass} pending={isSaving} pendingLabel="Saving" type="submit">
              Save distributor settings
            </ActionButton>
          </form>

          <form className="grid content-start gap-3 rounded-lg border border-line bg-surface p-4" onSubmit={createAllocation}>
            <div>
              <h3 className="text-xl font-black">Bulk DL allocation</h3>
              <p className="text-sm leading-relaxed text-muted">Credit a distributor with discounted volume for resale.</p>
            </div>
            {distributors && distributors.length === 0 ? (
              <p className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm leading-relaxed text-muted">
                No users have the Distributor role yet. Set a user&rsquo;s role to Distributor from the Users page before granting an allocation.
              </p>
            ) : (
              <>
                <label className="font-bold" htmlFor="distributor-id">Distributor</label>
                <select id="distributor-id" className={inputClass} value={selectedDistributorId} onChange={(e) => setSelectedDistributorId(e.target.value)} required>
                  {(distributors ?? []).map((user) => (
                    <option key={user.id} value={user.id}>{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}</option>
                  ))}
                </select>
                <label className="font-bold" htmlFor="allocation-amount">DL tokens</label>
                <input id="allocation-amount" className={inputClass} min="0.00000001" step="0.00000001" type="number" value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} required />
                <label className="font-bold" htmlFor="allocation-discount">Discount rate</label>
                <input id="allocation-discount" className={inputClass} min="0" max="1" step="0.0001" type="number" placeholder={defaultBulkDiscountRate} value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} />
                {effectiveTokenAmount && (
                  <div className="grid gap-1 rounded-lg border border-line bg-white px-3 py-2.5 text-sm">
                    <p className="text-muted">
                      {effectiveTokenAmount.amount.toLocaleString()} DL is credited to the distributor&rsquo;s wallet in full.
                    </p>
                    {effectiveTokenAmount.rate > 0 && (
                      <p className="font-bold">
                        At a {(effectiveTokenAmount.rate * 100).toFixed(2)}% discount, that&rsquo;s worth {effectiveTokenAmount.discountedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} DL to invoice off-platform &mdash; the discount is a record for your own accounting, not a charge collected here.
                      </p>
                    )}
                  </div>
                )}
                <label className="font-bold" htmlFor="allocation-note">Note</label>
                <textarea id="allocation-note" className={`${inputClass} min-h-24`} value={note} onChange={(e) => setNote(e.target.value)} />
                <ActionButton className={primaryButtonClass} disabled={!selectedDistributorId} pending={isAllocating} pendingLabel="Crediting" type="submit">
                  Credit distributor
                </ActionButton>
              </>
            )}
          </form>
        </div>
      )}

      {!isLoading && (
        <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="text-xl font-black">Allocation history</h3>
          {isLoadingHistory && <p className="text-muted">Loading...</p>}
          {!isLoadingHistory && (!allocationHistory || allocationHistory.items.length === 0) && (
            <p className="text-sm text-muted">No bulk allocations have been granted yet.</p>
          )}
          {!isLoadingHistory && allocationHistory && allocationHistory.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-bold uppercase text-muted">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Distributor</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Discount</th>
                    <th className="py-2 pr-4">Granted by</th>
                    <th className="py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationHistory.items.map((allocation) => (
                    <tr className="border-b border-line last:border-0" key={allocation.id}>
                      <td className="py-2 pr-4 text-muted">{new Date(allocation.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 pr-4 font-bold">{allocation.distributor.name}</td>
                      <td className="py-2 pr-4">{Number(allocation.tokenAmount).toLocaleString()} DL</td>
                      <td className="py-2 pr-4">{(Number(allocation.discountRate) * 100).toFixed(2)}%</td>
                      <td className="py-2 pr-4 text-muted">{allocation.grantedBy.name}</td>
                      <td className="py-2 text-muted">{allocation.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && <p className="leading-relaxed text-danger" role="alert">{error}</p>}
    </section>
  );
}
