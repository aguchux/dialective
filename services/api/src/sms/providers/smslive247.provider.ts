import { SmsProvider } from '../sms-provider.interface';

// https://smslive247api.readme.io/v5.0/reference/smsmessagesend -- Bearer
// auth (Authorization: Bearer <secret key>), POST /api/v5/sms, body is
// {senderID, messageText, phoneNumber, routeID?}. routeID is optional and
// configured per environment so production can use SMSLive247's transactional
// route without coupling routing policy to application code.
const BASE_URL = 'https://api.smslive247.com';

export class Smslive247Provider implements SmsProvider {
  readonly key = 'smslive247' as const;

  async send(toE164: string, body: string, senderIdOverride?: string): Promise<void> {
    const apiKey = process.env.SMSLIVE247_API_KEY;
    const senderId = senderIdOverride || process.env.SMSLIVE247_SENDER_ID;
    const routeId = process.env.SMSLIVE247_ROUTE_ID?.trim();
    if (!apiKey || !senderId) throw new Error('SMSLive247 credentials not set');

    // SMSLive247 rejects E.164's leading "+" on destination numbers ("None
    // of the provided destination numbers could be processed") -- they
    // expect a bare MSISDN, e.g. 2348012345678 rather than +2348012345678.
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
