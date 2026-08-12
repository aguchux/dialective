import { SmsProvider } from '../sms-provider.interface';

export class TermiiProvider implements SmsProvider {
  readonly key = 'termii' as const;

  async send(toE164: string, body: string): Promise<void> {
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = process.env.TERMII_SENDER_ID;
    if (!apiKey || !senderId) throw new Error('Termii credentials not set');

    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
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
