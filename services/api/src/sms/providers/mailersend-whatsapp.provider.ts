/**
 * Sends a WhatsApp OTP via MailerSend's WhatsApp API
 * (https://developers.mailersend.com/api/v1/whatsapp.html). Unlike the SMS
 * providers in this directory, WhatsApp requires a pre-approved Meta
 * template -- there's no free-form message body, only positional variable
 * substitution into the template's slots ({{1}}, {{2}}, ...). This provider
 * always sends exactly one body variable (the 6-digit code), matching a
 * single-variable OTP template such as MailerSend's own "otp_code" starter
 * template.
 *
 * Credentials/template id come from PlatformSettings (admin-rotatable, see
 * whatsapp-crypto.util.ts), not env vars -- a deliberate departure from
 * every other SmsProvider in this directory, since the API key and template
 * id are expected to change without a redeploy.
 */
export interface MailerSendWhatsAppConfig {
  apiKey: string;
  senderId: string;
  templateId: string;
}

export class MailerSendWhatsAppProvider {
  readonly key = 'mailersend-whatsapp' as const;

  async send(toE164: string, code: string, config: MailerSendWhatsAppConfig): Promise<void> {
    const res = await fetch('https://api.mailersend.com/v1/whatsapp/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.senderId,
        to: [toE164],
        template_id: config.templateId,
        personalization: [{ to: toE164, data: { body: [code] } }],
      }),
    });
    if (!res.ok) {
      throw new Error(`MailerSend WhatsApp request failed: ${res.status} ${await res.text()}`);
    }
  }
}
