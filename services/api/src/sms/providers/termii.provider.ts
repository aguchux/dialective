import { SmsProvider } from '../sms-provider.interface';

// Termii issues an account/region-specific base URL (visible on the
// dashboard) -- v4.api.termii.com is their current documented default, but
// TERMII_BASE_URL lets an account with a different assigned host override it
// without a code change.
const DEFAULT_BASE_URL = 'https://v4.api.termii.com';

// Termii routes a message differently depending on `channel`:
//   - generic: cheapest, but Nigerian carriers silently drop it for numbers
//     registered on the NCC's Do-Not-Disturb list -- most personal mobile
//     lines are on that list, so this is why "the SMS never arrives" even
//     though Termii's API returns success.
//   - dnd: bypasses the DND filter (higher cost per message), the channel to
//     use for anything transactional/time-sensitive like an OTP.
//   - whatsapp: delivers via WhatsApp Business instead of SMS.
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
