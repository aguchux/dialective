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
type WhatsappProvider = 'mailersend' | 'meta_direct';

const PROVIDER_LABELS: Record<WhatsappProvider, string> = {
  mailersend: 'MailerSend',
  meta_direct: 'Meta WhatsApp Cloud API (direct)',
};

export function WhatsappMessagingSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [otpChannel, setOtpChannel] = useState<OtpChannel>('sms');
  const [whatsappOtpEnabled, setWhatsappOtpEnabled] = useState(false);
  const [whatsappProvider, setWhatsappProvider] = useState<WhatsappProvider>('mailersend');

  const [whatsappSenderId, setWhatsappSenderId] = useState('');
  const [whatsappTemplateId, setWhatsappTemplateId] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);

  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState('');
  const [metaTemplateName, setMetaTemplateName] = useState('');
  const [metaTemplateLanguage, setMetaTemplateLanguage] = useState('en_US');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaAccessTokenSet, setMetaAccessTokenSet] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setOtpChannel((settings.otpChannel as OtpChannel) ?? 'sms');
    setWhatsappOtpEnabled(settings.whatsappOtpEnabled);
    setWhatsappProvider((settings.whatsappProvider as WhatsappProvider) ?? 'mailersend');
    setWhatsappSenderId(settings.whatsappSenderId ?? '');
    setWhatsappTemplateId(settings.whatsappTemplateId ?? '');
    setApiKeySet(settings.whatsappApiKeySet);
    setMetaPhoneNumberId(settings.whatsappMetaPhoneNumberId ?? '');
    setMetaBusinessAccountId(settings.whatsappMetaBusinessAccountId ?? '');
    setMetaTemplateName(settings.whatsappMetaTemplateName ?? '');
    setMetaTemplateLanguage(settings.whatsappMetaTemplateLanguage ?? 'en_US');
    setMetaAccessTokenSet(settings.whatsappMetaAccessTokenSet);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (otpChannel === 'whatsapp' && !whatsappOtpEnabled) {
      setError('Turn on "Enable WhatsApp OTP" before selecting WhatsApp as the OTP channel.');
      return;
    }

    try {
      await updateSettings({
        otpChannel,
        whatsappOtpEnabled,
        whatsappProvider,
        whatsappSenderId: whatsappSenderId.trim(),
        whatsappTemplateId: whatsappTemplateId.trim(),
        ...(whatsappApiKey !== '' ? { whatsappApiKey } : {}),
        whatsappMetaPhoneNumberId: metaPhoneNumberId.trim(),
        whatsappMetaBusinessAccountId: metaBusinessAccountId.trim(),
        whatsappMetaTemplateName: metaTemplateName.trim(),
        whatsappMetaTemplateLanguage: metaTemplateLanguage.trim() || 'en_US',
        ...(metaAccessToken !== '' ? { whatsappMetaAccessToken: metaAccessToken } : {}),
      }).unwrap();
      setWhatsappApiKey('');
      setMetaAccessToken('');
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
          Delivers OTP codes over WhatsApp, as an alternative to plain SMS. Both backends below
          require an approved Meta message template (a single-variable template, e.g. one that reads
          &quot;Your code is {'{{1}}'}&quot;) -- only one backend is active at a time, chosen below.
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
                <span className="block font-bold">Enable WhatsApp OTP</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master switch. When off, OTP delivery always falls back to SMS/email even if
                  WhatsApp is selected as the OTP channel below.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="whatsapp-provider">
              Active backend
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Which service actually sends the WhatsApp message. Only the selected backend&apos;s
              credentials below are used.
            </p>
            <select
              className={`${inputClass} max-w-60`}
              id="whatsapp-provider"
              onChange={(e) => setWhatsappProvider(e.target.value as WhatsappProvider)}
              value={whatsappProvider}
            >
              {(Object.keys(PROVIDER_LABELS) as WhatsappProvider[]).map((key) => (
                <option key={key} value={key}>
                  {PROVIDER_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-line pt-5">
            <h3 className="text-lg font-black">MailerSend</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Requires a MailerSend account with a WhatsApp Business sender connected and an
              approved template -- create these in your MailerSend dashboard first.
            </p>
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
              placeholder={
                apiKeySet ? 'Leave blank to keep the saved key' : 'Paste your MailerSend API key'
              }
              type="password"
              value={whatsappApiKey}
            />
          </div>

          <div className="border-t border-line pt-5">
            <h3 className="text-lg font-black">Meta WhatsApp Cloud API (direct)</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Sends straight to Meta&apos;s Graph API -- no third-party provider in the path.
              Requires a WhatsApp Business phone number connected in Meta Business Manager, a
              system-user access token, and an approved template.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="meta-phone-number-id">
              Phone number ID
            </label>
            <p className="text-sm leading-relaxed text-muted">
              The WhatsApp Business phone number identifier from Meta Business Manager (not the
              phone number itself).
            </p>
            <input
              className={`${inputClass} max-w-60`}
              id="meta-phone-number-id"
              maxLength={64}
              onChange={(e) => setMetaPhoneNumberId(e.target.value)}
              placeholder="e.g. 123456789012345"
              type="text"
              value={metaPhoneNumberId}
            />
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="meta-business-account-id">
              Business Account ID (optional)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              The WABA ID -- not required to send messages, kept here for admin reference only.
            </p>
            <input
              className={`${inputClass} max-w-60`}
              id="meta-business-account-id"
              maxLength={64}
              onChange={(e) => setMetaBusinessAccountId(e.target.value)}
              placeholder="e.g. 987654321098765"
              type="text"
              value={metaBusinessAccountId}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="font-bold" htmlFor="meta-template-name">
                Template name
              </label>
              <input
                className={inputClass}
                id="meta-template-name"
                maxLength={100}
                onChange={(e) => setMetaTemplateName(e.target.value)}
                placeholder="e.g. otp_code"
                type="text"
                value={metaTemplateName}
              />
            </div>
            <div className="grid gap-2">
              <label className="font-bold" htmlFor="meta-template-language">
                Template language
              </label>
              <input
                className={inputClass}
                id="meta-template-language"
                maxLength={20}
                onChange={(e) => setMetaTemplateLanguage(e.target.value)}
                placeholder="e.g. en_US"
                type="text"
                value={metaTemplateLanguage}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="font-bold" htmlFor="meta-access-token">
              Access token
            </label>
            <p className="text-sm leading-relaxed text-muted">
              {metaAccessTokenSet
                ? 'A token is currently saved and encrypted -- leave blank to keep it, or paste a new one to replace it.'
                : 'No token saved yet. A long-lived system-user token is recommended over a short-lived user token.'}
            </p>
            <input
              autoComplete="off"
              className={`${inputClass} max-w-80`}
              id="meta-access-token"
              onChange={(e) => setMetaAccessToken(e.target.value)}
              placeholder={
                metaAccessTokenSet
                  ? 'Leave blank to keep the saved token'
                  : 'Paste your Meta access token'
              }
              type="password"
              value={metaAccessToken}
            />
          </div>

          <div className="grid gap-2 border-t border-line pt-5">
            <span className="font-bold">OTP channel</span>
            <p className="text-sm leading-relaxed text-muted">
              Which channel a trainer with a verified phone number receives their OTP on. Falls back
              to SMS automatically whenever WhatsApp is unavailable or misconfigured.
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
