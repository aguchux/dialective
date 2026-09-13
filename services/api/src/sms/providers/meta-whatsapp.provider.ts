/**
 * Sends a WhatsApp OTP directly through Meta's WhatsApp Cloud API
 * (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages),
 * bypassing any third-party provider (MailerSend, Twilio, etc). Requires a
 * WhatsApp Business phone number connected in Meta Business Manager and a
 * pre-approved template, same Meta requirement as the MailerSend path --
 * only the transport differs. Always sends exactly one body variable (the
 * 6-digit code), matching a single-variable OTP template.
 */
export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
}

const GRAPH_API_VERSION = 'v21.0';

export class MetaWhatsAppProvider {
  readonly key = 'meta-whatsapp' as const;

  async send(toE164: string, code: string, config: MetaWhatsAppConfig): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toE164,
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Meta WhatsApp request failed: ${res.status} ${await res.text()}`);
    }
  }
}
