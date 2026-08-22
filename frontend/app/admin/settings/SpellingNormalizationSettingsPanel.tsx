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

type ProviderKey = 'openai' | 'deepseek' | 'anthropic';

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
};

const DEFAULT_ORDER: ProviderKey[] = ['openai', 'deepseek', 'anthropic'];

function parseOrder(csv: string): ProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as ProviderKey[];
  const isValid =
    parts.length === 3 &&
    DEFAULT_ORDER.every((key) => parts.includes(key)) &&
    new Set(parts).size === 3;
  return isValid ? parts : DEFAULT_ORDER;
}

export function SpellingNormalizationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [order, setOrder] = useState<ProviderKey[]>(DEFAULT_ORDER);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.spellingNormalizationEnabled);
    setOrder(parseOrder(settings.spellingNormalizationProviderOrder));
  }, [settings]);

  function setChoice(position: 0 | 1 | 2, provider: ProviderKey) {
    setOrder((current) => {
      const next = [...current] as ProviderKey[];
      next[position] = provider;
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (new Set(order).size !== 3) {
      setError('Each provider choice (1st, 2nd, 3rd) must be distinct.');
      return;
    }

    try {
      await updateSettings({
        spellingNormalizationEnabled: enabled,
        spellingNormalizationProviderOrder: order.join(','),
      }).unwrap();
      setMessage('Spelling normalization settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save spelling normalization settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Dialect Spelling Normalization</h2>
        <p className="leading-relaxed text-muted">
          When a trainer submits a word-training spelling, an LLM drafts a corrected version in
          proper dialect orthography, stored alongside the trainer's raw text for dataset review.
          This never overwrites what the trainer typed and never affects scoring or payout.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="spelling-normalization-enabled"
            >
              <input
                checked={enabled}
                className="mt-0.5 size-5 accent-accent"
                id="spelling-normalization-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable spelling normalization</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Off by default so nothing runs until API keys are configured and this is
                  explicitly enabled.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Provider order (fallback chain)</span>
            <p className="text-sm leading-relaxed text-muted">
              1st choice is tried first; 2nd and 3rd are only used if the ones before them fail. All
              three must be distinct.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['1st choice', '2nd choice', '3rd choice'] as const).map((label, index) => (
                <div className="grid gap-1" key={label}>
                  <label
                    className="text-sm font-bold"
                    htmlFor={`spelling-normalization-order-${index}`}
                  >
                    {label}
                  </label>
                  <select
                    className={inputClass}
                    id={`spelling-normalization-order-${index}`}
                    value={order[index]}
                    onChange={(e) => setChoice(index as 0 | 1 | 2, e.target.value as ProviderKey)}
                  >
                    {DEFAULT_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {PROVIDER_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save spelling normalization settings
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
