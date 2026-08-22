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

export function LiveChatSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [tawkToEnabled, setTawkToEnabled] = useState(false);
  const [tawkToPropertyId, setTawkToPropertyId] = useState('');
  const [tawkToWidgetId, setTawkToWidgetId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setTawkToEnabled(settings.tawkToEnabled);
    setTawkToPropertyId(settings.tawkToPropertyId ?? '');
    setTawkToWidgetId(settings.tawkToWidgetId ?? '');
  }, [settings]);

  const missingIds = tawkToEnabled && (!tawkToPropertyId.trim() || !tawkToWidgetId.trim());

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        tawkToEnabled,
        tawkToPropertyId: tawkToPropertyId.trim(),
        tawkToWidgetId: tawkToWidgetId.trim(),
      }).unwrap();
      setMessage('Live chat settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save live chat settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Live chat</h2>
        <p className="leading-relaxed text-muted">
          Adds the Tawk.to chat widget to every public and dashboard page. Find your Property ID and
          Widget ID in your Tawk.to dashboard under Administration &rarr; Chat Widget &rarr; Widget
          Settings, or in the embed snippet&rsquo;s URL:{' '}
          <code>embed.tawk.to/&lt;propertyId&gt;/&lt;widgetId&gt;</code>.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="tawk-to-enabled"
            >
              <input
                checked={tawkToEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="tawk-to-enabled"
                onChange={(event) => setTawkToEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable Tawk.to live chat</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  The widget only loads once this is on and both IDs below are set -- a
                  half-configured toggle never ships a broken embed to visitors.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="tawk-to-property-id">
              Property ID
            </label>
            <input
              className={inputClass}
              id="tawk-to-property-id"
              onChange={(e) => setTawkToPropertyId(e.target.value)}
              placeholder="e.g. 60f1a2b3c4d5e6f7a8b9c0d1"
              value={tawkToPropertyId}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="tawk-to-widget-id">
              Widget ID
            </label>
            <input
              className={inputClass}
              id="tawk-to-widget-id"
              onChange={(e) => setTawkToWidgetId(e.target.value)}
              placeholder="e.g. 1f2g3h4i5"
              value={tawkToWidgetId}
            />
          </div>

          {missingIds && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Enabled, but the widget won&rsquo;t show until both IDs are filled in.
            </p>
          )}

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save live chat settings
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
