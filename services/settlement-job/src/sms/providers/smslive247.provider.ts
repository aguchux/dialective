// Ported from services/api/src/sms/providers/smslive247.provider.ts -- keep in sync by hand.
import { SmsProvider } from '../sms-provider.interface';

const BASE_URL = 'https://api.smslive247.com';

export class Smslive247Provider implements SmsProvider {
  readonly key = 'smslive247' as const;

  async send(toE164: string, body: string, senderIdOverride?: string): Promise<void> {
    const apiKey = process.env.SMSLIVE247_API_KEY;
    const senderId = senderIdOverride || process.env.SMSLIVE247_SENDER_ID;
    const routeId = process.env.SMSLIVE247_ROUTE_ID?.trim();
    if (!apiKey || !senderId) throw new Error('SMSLive247 credentials not set');

    const res = await fetch(`${BASE_URL}/api/v5/sms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderID: senderId,
        messageText: body,
        phoneNumber: toE164.replace(/^\+/, ''),
        ...(routeId ? { routeID: routeId } : {}),
      }),
    });
    if (!res.ok) throw new Error(`SMSLive247 request failed: ${res.status} ${await res.text()}`);
  }
}
