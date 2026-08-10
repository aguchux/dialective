'use client';

import { useEffect, useState } from 'react';
import { normalizeErrorMessage, useGetPlatformSettingsQuery, useUpdatePlatformSettingsMutation } from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function NotificationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [resendFromAddress, setResendFromAddress] = useState('');
  const [leadsNotificationAddress, setLeadsNotificationAddress] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setResendFromAddress(settings.resendFromAddress ?? '');
    setLeadsNotificationAddress(settings.leadsNotificationAddress ?? '');
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updateSettings({
        ...(resendFromAddress !== '' ? { resendFromAddress } : {}),
        ...(leadsNotificationAddress !== '' ? { leadsNotificationAddress } : {}),
      }).unwrap();
      setMessage('Notification settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save notification settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Notifications</h2>
        <p className="leading-relaxed text-muted">
          Email addresses used for outbound transactional mail and internal alerts. Leave a field blank to use the
          deployment default.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label className="font-bold" htmlFor="resend-from">
              Sender address
            </label>
            <p className="text-sm leading-relaxed text-muted">
              &quot;From&quot; address on password-reset, verification, and magic-link emails. Must be a verified
              domain in Resend.
            </p>
            <input
              className={inputClass}
              id="resend-from"
              type="email"
              placeholder="Default"
              value={resendFromAddress}
              onChange={(e) => setResendFromAddress(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="leads-address">
              Data-access lead notifications
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Inbox that receives a notification whenever someone submits the &quot;Subscribe to voice data&quot;
              form.
            </p>
            <input
              className={inputClass}
              id="leads-address"
              type="email"
              placeholder="Default"
              value={leadsNotificationAddress}
              onChange={(e) => setLeadsNotificationAddress(e.target.value)}
            />
          </div>

          <div>
            <button className={primaryButtonClass} type="submit" disabled={isSaving}>
              Save notification settings
            </button>
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
