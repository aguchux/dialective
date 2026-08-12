import { SmsProvider } from '../sms-provider.interface';

// https://smslive247api.readme.io/v5.0/reference/smsmessagesend -- Bearer
// auth (Authorization: Bearer <secret key>), POST /api/v5/sms, body is
// {senderID, messageText, phoneNumber}.
const BASE_URL = 'https://api.smslive247.com';

export class Smslive247Provider implements SmsProvider {
  readonly key = 'smslive247' as const;

  async send(toE164: string, body: string): Promise<void> {
    const apiKey = process.env.SMSLIVE247_API_KEY;
    const senderId = process.env.SMSLIVE247_SENDER_ID;
    if (!apiKey || !senderId) throw new Error('SMSLive247 credentials not set');

    const res = await fetch(`${BASE_URL}/api/v5/sms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ senderID: senderId, messageText: body, phoneNumber: toE164 }),
    });
    if (!res.ok) throw new Error(`SMSLive247 request failed: ${res.status} ${await res.text()}`);
  }
}
