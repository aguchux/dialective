import { SmsProvider } from '../sms-provider.interface';

export class TwilioProvider implements SmsProvider {
  readonly key = 'twilio' as const;

  async send(toE164: string, body: string): Promise<void> {
    // Twilio has no sender-ID concept (it sends from a purchased phone
    // number, not a named sender ID), so it never reads a 3rd argument --
    // PlatformSettings.smsSenderId simply doesn't apply here.
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!accountSid || !authToken || !fromNumber) throw new Error('Twilio credentials not set');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toE164, From: fromNumber, Body: body }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio request failed: ${res.status} ${await res.text()}`);
  }
}
