'use client';

import { useEffect, useState } from 'react';
import { normalizeErrorMessage, useGetPlatformSettingsQuery, useUpdatePlatformSettingsMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

type SmsProviderKey = 'termii' | 'twilio' | 'africastalking' | 'smslive247';

const PROVIDER_LABELS: Record<SmsProviderKey, string> = {
  termii: 'Termii',
  twilio: 'Twilio',
  africastalking: "Africa's Talking",
  smslive247: 'SMSLive247',
};

const DEFAULT_ORDER: SmsProviderKey[] = ['termii', 'twilio', 'africastalking', 'smslive247'];

function parseOrder(csv: string): SmsProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as SmsProviderKey[];
  const isValid =
    parts.length === DEFAULT_ORDER.length &&
    DEFAULT_ORDER.every((key) => parts.includes(key)) &&
    new Set(parts).size === DEFAULT_ORDER.length;
  return isValid ? parts : DEFAULT_ORDER;
}

export function SmsSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [order, setOrder] = useState<SmsProviderKey[]>(DEFAULT_ORDER);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setOrder(parseOrder(settings.smsProviderOrder));
  }, [settings]);

  function setChoice(position: 0 | 1 | 2 | 3, provider: SmsProviderKey) {
    setOrder((current) => {
      const next = [...current] as SmsProviderKey[];
      next[position] = provider;
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (new Set(order).size !== DEFAULT_ORDER.length) {
      setError('Each provider choice must be distinct.');
      return;
    }

    try {
      await updateSettings({ smsProviderOrder: order.join(',') }).unwrap();
      setMessage('SMS provider settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save SMS provider settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">SMS Providers</h2>
        <p className="leading-relaxed text-muted">
          Delivers phone-verification codes (Profile &gt; Phone number, required before payment methods or P2P
          trading). Providers are tried in order below -- the first that succeeds is used, the others are only
          called if it fails. A provider with no API key configured on the server simply fails over to the next one.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-2">
            <span className="font-bold">Provider order (fallback chain)</span>
            <p className="text-sm leading-relaxed text-muted">
              1st choice is tried first; the rest are only used if the ones before them fail. All four must be
              distinct.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['1st choice', '2nd choice', '3rd choice', '4th choice'] as const).map((label, index) => (
                <div className="grid gap-1" key={label}>
                  <label className="text-sm font-bold" htmlFor={`sms-order-${index}`}>
                    {label}
                  </label>
                  <select
                    className={inputClass}
                    id={`sms-order-${index}`}
                    value={order[index]}
                    onChange={(e) => setChoice(index as 0 | 1 | 2 | 3, e.target.value as SmsProviderKey)}
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
            <ActionButton className={primaryButtonClass} type="submit" pending={isSaving} pendingLabel="Saving">
              Save SMS provider settings
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
