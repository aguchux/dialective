// Ported from services/api/src/sms/providers/termii.provider.ts -- keep in sync by hand.
import { SmsProvider } from '../sms-provider.interface';

const DEFAULT_BASE_URL = 'https://v4.api.termii.com';

const VALID_CHANNELS = ['generic', 'dnd', 'whatsapp'] as const;
type TermiiChannel = (typeof VALID_CHANNELS)[number];
const DEFAULT_CHANNEL: TermiiChannel = 'generic';

function resolveChannel(): TermiiChannel {
  const raw = process.env.TERMII_CHANNEL?.trim().toLowerCase();
  if (!raw) return DEFAULT_CHANNEL;
  return (VALID_CHANNELS as readonly string[]).includes(raw)
    ? (raw as TermiiChannel)
    : DEFAULT_CHANNEL;
}

export class TermiiProvider implements SmsProvider {
  readonly key = 'termii' as const;

  async send(toE164: string, body: string, senderIdOverride?: string): Promise<void> {
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = senderIdOverride || process.env.TERMII_SENDER_ID;
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
        channel: resolveChannel(),
      }),
    });
    if (!res.ok) throw new Error(`Termii request failed: ${res.status} ${await res.text()}`);
  }
}
