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

// Splits a Resend "from" string ("Dialect Library" <noreply@x.com>) into its
// display-name and email parts for editing as two separate fields; a bare
// email (no name) round-trips as senderName: ''.
function parseFromAddress(value: string): { senderName: string; senderEmail: string } {
  const match = value.trim().match(/^"?([^"<]*?)"?\s*<([^<>]+)>$/);
  if (match) return { senderName: match[1].trim(), senderEmail: match[2].trim() };
  return { senderName: '', senderEmail: value.trim() };
}

function formatFromAddress(senderName: string, senderEmail: string): string {
  const name = senderName.trim();
  const email = senderEmail.trim();
  return name ? `"${name}" <${email}>` : email;
}

export function NotificationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [leadsNotificationAddress, setLeadsNotificationAddress] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const parsed = parseFromAddress(settings.resendFromAddress ?? '');
    setSenderName(parsed.senderName);
    setSenderEmail(parsed.senderEmail);
    setLeadsNotificationAddress(settings.leadsNotificationAddress ?? '');
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updateSettings({
        ...(senderEmail !== ''
          ? { resendFromAddress: formatFromAddress(senderName, senderEmail) }
          : {}),
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
          Email addresses used for outbound transactional mail and internal alerts. Leave a field
          blank to use the deployment default.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label className="font-bold" htmlFor="resend-from-name">
              Sender name &amp; address
            </label>
            <p className="text-sm leading-relaxed text-muted">
              &quot;From&quot; name and address on password-reset, verification, and magic-link
              emails. The email must be a verified domain in Resend. Name is optional.
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
              <input
                className={inputClass}
                id="resend-from-name"
                type="text"
                placeholder="Dialect Library"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
              <input
                className={inputClass}
                id="resend-from-email"
                type="email"
                placeholder="Default"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
              />
            </div>
            {senderEmail && (
              <p className="text-xs text-muted">
                Sends as: {formatFromAddress(senderName, senderEmail)}
              </p>
            )}
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="leads-address">
              Data-access lead notifications
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Inbox that receives a notification whenever someone submits the &quot;Subscribe to
              voice data&quot; form.
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
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save notification settings
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
