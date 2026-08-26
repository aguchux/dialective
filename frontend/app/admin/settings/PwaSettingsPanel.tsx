'use client';

import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';

export function PwaSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();
  const [enabled, setEnabled] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState('60');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.pwaInstallPromptEnabled);
    setReminderMinutes(String(settings.pwaInstallPromptReminderMinutes));
  }, [settings]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const minutes = Number(reminderMinutes);
    if (!Number.isInteger(minutes) || minutes < 60 || minutes > 10_080) {
      setError('Choose a whole number from 60 minutes to 7 days.');
      return;
    }
    try {
      await updateSettings({
        pwaInstallPromptEnabled: enabled,
        pwaInstallPromptReminderMinutes: minutes,
      }).unwrap();
      setMessage('Web app install settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save web app install settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Web app install</h2>
        <p className="leading-relaxed text-muted">
          Control the optional install reminder for the Dialect Library mobile and desktop web app.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={save}>
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
            htmlFor="pwa-install-prompt-enabled"
          >
            <input
              checked={enabled}
              className="mt-0.5 size-5 accent-accent"
              id="pwa-install-prompt-enabled"
              onChange={(event) => setEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-bold">Show install reminder</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Signed-in users can still choose Install app from their avatar menu. Turning this
                off only stops automatic reminders.
              </span>
            </span>
          </label>

          <label className="grid gap-1 font-bold" htmlFor="pwa-install-reminder-minutes">
            Reminder interval (minutes)
            <span className="text-sm font-normal leading-relaxed text-muted">
              A dismissed prompt may reappear after this interval. Minimum is 60 minutes.
            </span>
            <input
              className="min-h-11 rounded-lg border border-line bg-surface px-3"
              id="pwa-install-reminder-minutes"
              max="10080"
              min="60"
              onChange={(event) => setReminderMinutes(event.target.value)}
              step="1"
              type="number"
              value={reminderMinutes}
            />
          </label>

          <ActionButton
            className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            pending={isSaving}
            pendingLabel="Saving"
            type="submit"
          >
            Save web app settings
          </ActionButton>
        </form>
      )}

      {message && <p className="text-accent-dark">{message}</p>}
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
