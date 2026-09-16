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

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,12}$/;

export function AnalyticsSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [googleAnalyticsEnabled, setGoogleAnalyticsEnabled] = useState(false);
  const [googleAnalyticsMeasurementId, setGoogleAnalyticsMeasurementId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setGoogleAnalyticsEnabled(settings.googleAnalyticsEnabled);
    setGoogleAnalyticsMeasurementId(settings.googleAnalyticsMeasurementId ?? '');
  }, [settings]);

  const trimmedId = googleAnalyticsMeasurementId.trim();
  const idLooksValid = trimmedId === '' || MEASUREMENT_ID_PATTERN.test(trimmedId);
  const missingId = googleAnalyticsEnabled && !trimmedId;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!idLooksValid) {
      setError('Measurement ID should look like a GA4 ID, e.g. G-ABC1234567.');
      return;
    }

    try {
      await updateSettings({
        googleAnalyticsEnabled,
        googleAnalyticsMeasurementId: trimmedId || null,
      }).unwrap();
      setMessage('Analytics settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save analytics settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Analytics &amp; Metrics</h2>
        <p className="leading-relaxed text-muted">
          Google Analytics (gtag.js) only loads for a visitor once they&rsquo;ve acknowledged the
          cookie consent banner, and only once this toggle is on and a Measurement ID is set below --
          a half-configured toggle never ships a broken tag to visitors, and nobody is tracked before
          consenting.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="google-analytics-enabled"
            >
              <input
                checked={googleAnalyticsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="google-analytics-enabled"
                onChange={(event) => setGoogleAnalyticsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable Google Analytics</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master switch -- when off, no GA script is ever loaded, regardless of the
                  Measurement ID below.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="google-analytics-measurement-id">
              Measurement ID
            </label>
            <input
              className={inputClass}
              id="google-analytics-measurement-id"
              onChange={(e) => setGoogleAnalyticsMeasurementId(e.target.value)}
              placeholder="e.g. G-ABC1234567"
              value={googleAnalyticsMeasurementId}
            />
            <p className="text-sm leading-relaxed text-muted">
              From the GA4 property&rsquo;s Data Streams page. GA4 IDs only (starting with{' '}
              <code>G-</code>) -- the older Universal Analytics <code>UA-</code> format isn&rsquo;t
              supported.
            </p>
          </div>

          {!idLooksValid && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
              That doesn&rsquo;t look like a GA4 Measurement ID (expected e.g. G-ABC1234567).
            </p>
          )}

          {idLooksValid && missingId && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Enabled, but analytics won&rsquo;t load until a Measurement ID is filled in.
            </p>
          )}

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save analytics settings
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
