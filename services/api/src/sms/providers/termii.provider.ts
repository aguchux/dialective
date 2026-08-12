import { SmsProvider } from '../sms-provider.interface';

// Termii issues an account/region-specific base URL (visible on the
// dashboard) -- v4.api.termii.com is their current documented default, but
// TERMII_BASE_URL lets an account with a different assigned host override it
// without a code change.
const DEFAULT_BASE_URL = 'https://v4.api.termii.com';

export class TermiiProvider implements SmsProvider {
  readonly key = 'termii' as const;

  async send(toE164: string, body: string): Promise<void> {
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = process.env.TERMII_SENDER_ID;
    if (!apiKey || !senderId) throw new Error('Termii credentials not set');

    const baseUrl = process.env.TERMII_BASE_URL ?? DEFAULT_BASE_URL;
    const res = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: toE164.replace(/^\+/, ''),
        from: senderId,
        sms: body,
        type: 'plain',
        channel: 'generic',
      }),
    });
    if (!res.ok) throw new Error(`Termii request failed: ${res.status} ${await res.text()}`);
  }
}
