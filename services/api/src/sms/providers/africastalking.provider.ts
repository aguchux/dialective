import { SmsProvider } from '../sms-provider.interface';

export class AfricasTalkingProvider implements SmsProvider {
  readonly key = 'africastalking' as const;

  async send(toE164: string, body: string): Promise<void> {
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    const username = process.env.AFRICASTALKING_USERNAME;
    const senderId = process.env.AFRICASTALKING_SENDER_ID;
    if (!apiKey || !username) throw new Error('Africa\'s Talking credentials not set');

    const params = new URLSearchParams({ username, to: toE164, message: body });
    if (senderId) params.set('from', senderId);

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`Africa's Talking request failed: ${res.status} ${await res.text()}`);
  }
}
