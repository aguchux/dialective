'use client';

import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function AdsMonetisationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();
  const [enabled, setEnabled] = useState(false);
  const [scriptUrl, setScriptUrl] = useState('');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.trainerAdsterra728Enabled);
    setScriptUrl(settings.trainerAdsterra728ScriptUrl ?? '');
    setKey(settings.trainerAdsterra728Key ?? '');
  }, [settings]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const trimmedUrl = scriptUrl.trim();
    const trimmedKey = key.trim();
    if (enabled && (!trimmedUrl || !trimmedKey)) {
      setError('Add the Adsterra 728x90 script URL and unit key before enabling the ad.');
      return;
    }
    if (trimmedUrl && !/^https:\/\//i.test(trimmedUrl)) {
      setError('The script URL must use HTTPS.');
      return;
    }
    try {
      await updateSettings({
        trainerAdsterra728Enabled: enabled,
        trainerAdsterra728ScriptUrl: trimmedUrl || null,
        trainerAdsterra728Key: trimmedKey || null,
      }).unwrap();
      setMessage('Ads and monetisation settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save ads and monetisation settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Ads &amp; Monetisation</h2>
        <p className="leading-relaxed text-muted">
          Manage the trainer dashboard Adsterra 728x90 unit from the database. These values replace
          the legacy <code>NEXT_PUBLIC_ADSTERRA_728_SCRIPT_URL</code> and{' '}
          <code>NEXT_PUBLIC_ADSTERRA_728_KEY</code> frontend variables.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-2xl" onSubmit={handleSave}>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4">
            <input
              checked={enabled}
              className="mt-0.5 size-5 accent-accent"
              onChange={(event) => setEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-bold">Enable trainer dashboard ad</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Shows the configured Adsterra 728x90 unit on the trainer dashboard. The unit stays
                hidden until this gate and both configuration fields are valid.
              </span>
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="trainer-adsterra-script-url">
            Adsterra script URL
            <input
              className={inputClass}
              id="trainer-adsterra-script-url"
              onChange={(event) => setScriptUrl(event.target.value)}
              placeholder="https://.../invoke.js"
              type="url"
              value={scriptUrl}
            />
            <span className="font-normal text-muted">
              Paste only the HTTPS script src from the Adsterra 728x90 unit code.
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="trainer-adsterra-key">
            Adsterra unit key
            <input
              className={inputClass}
              id="trainer-adsterra-key"
              onChange={(event) => setKey(event.target.value)}
              placeholder="Ad unit key"
              type="text"
              value={key}
            />
            <span className="font-normal text-muted">
              This key is public ad-unit configuration, not an application secret.
            </span>
          </label>

          {message && <p className="font-bold text-emerald-700">{message}</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 font-bold text-danger">{error}</p>}
          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save ads settings
            </ActionButton>
          </div>
        </form>
      )}
    </section>
  );
}
