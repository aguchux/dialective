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

type OtpChannel = 'sms' | 'whatsapp';

export function WhatsappMessagingSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [otpChannel, setOtpChannel] = useState<OtpChannel>('sms');
  const [whatsappOtpEnabled, setWhatsappOtpEnabled] = useState(false);
  const [whatsappSenderId, setWhatsappSenderId] = useState('');
  const [whatsappTemplateId, setWhatsappTemplateId] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setOtpChannel((settings.otpChannel as OtpChannel) ?? 'sms');
    setWhatsappOtpEnabled(settings.whatsappOtpEnabled);
    setWhatsappSenderId(settings.whatsappSenderId ?? '');
    setWhatsappTemplateId(settings.whatsappTemplateId ?? '');
    setApiKeySet(settings.whatsappApiKeySet);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (otpChannel === 'whatsapp' && !whatsappOtpEnabled) {
      setError('Turn on "Enable MailerSend WhatsApp" before selecting WhatsApp as the OTP channel.');
      return;
    }

    try {
      await updateSettings({
        otpChannel,
        whatsappOtpEnabled,
        whatsappSenderId: whatsappSenderId.trim(),
        whatsappTemplateId: whatsappTemplateId.trim(),
        ...(whatsappApiKey !== '' ? { whatsappApiKey } : {}),
      }).unwrap();
      setWhatsappApiKey('');
      setMessage('WhatsApp messaging settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save WhatsApp messaging settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">WhatsApp Messaging</h2>
        <p className="leading-relaxed text-muted">
          Delivers OTP codes over WhatsApp via MailerSend, as an alternative to plain SMS. Requires a
          MailerSend account with a WhatsApp Business sender and an approved Meta message template
          (a single-variable template, e.g. one that reads &quot;Your code is {'{{1}}'}&quot;) --
          create these in your MailerSend dashboard first, then paste the sender/template ids below.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-5 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="whatsapp-otp-enabled"
            >
              <input
                checked={whatsappOtpEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="whatsapp-otp-enabled"
                onChange={(event) => setWhatsappOtpEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable MailerSend WhatsApp</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master switch. When off, OTP delivery always falls back to SMS/email even if
                  WhatsApp is selected as the OTP channel below.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="whatsapp-sender-id">
              WhatsApp sender phone number
            </label>
            <p className="text-sm leading-relaxed text-muted">
              The MailerSend-registered WhatsApp Business sender (E.164 digits, no leading +, e.g.
              15550001234).
            </p>
            <input
              className={`${inputClass} max-w-60`}
              id="whatsapp-sender-id"
              maxLength={32}
              onChange={(e) => setWhatsappSenderId(e.target.value)}
              placeholder="e.g. 15550001234"
              type="text"
              value={whatsappSenderId}
            />
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="whatsapp-template-id">
              Approved template ID
            </label>
            <p className="text-sm leading-relaxed text-muted">
              The Meta-approved WhatsApp template used for the OTP message. Must accept exactly one
              body variable -- the 6-digit code.
            </p>
            <input
              className={`${inputClass} max-w-60`}
              id="whatsapp-template-id"
              maxLength={100}
              onChange={(e) => setWhatsappTemplateId(e.target.value)}
              placeholder="e.g. otp_code"
              type="text"
              value={whatsappTemplateId}
            />
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="whatsapp-api-key">
              MailerSend API key
            </label>
            <p className="text-sm leading-relaxed text-muted">
              {apiKeySet
                ? 'A key is currently saved and encrypted -- leave blank to keep it, or paste a new one to replace it.'
                : 'No key saved yet. Needs the whatsapp_full scope.'}
            </p>
            <input
              autoComplete="off"
              className={`${inputClass} max-w-80`}
              id="whatsapp-api-key"
              onChange={(e) => setWhatsappApiKey(e.target.value)}
              placeholder={apiKeySet ? 'Leave blank to keep the saved key' : 'Paste your MailerSend API key'}
              type="password"
              value={whatsappApiKey}
            />
          </div>

          <div className="grid gap-2">
            <span className="font-bold">OTP channel</span>
            <p className="text-sm leading-relaxed text-muted">
              Which channel a trainer with a verified phone number receives their OTP on. Falls back
              to SMS automatically whenever WhatsApp is unavailable or misconfigured -- see the
              tooltip on Tokens &gt; Other credits for the equivalent trainer-facing safety net.
            </p>
            <select
              className={`${inputClass} max-w-60`}
              id="otp-channel"
              onChange={(e) => setOtpChannel(e.target.value as OtpChannel)}
              value={otpChannel}
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save WhatsApp messaging settings
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
