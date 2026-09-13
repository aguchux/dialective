import { createHash, randomInt } from 'crypto';
import { OtpChannel } from './otp.service';

/**
 * Short, human-typeable codes -- unlike token.util.ts's generateOpaqueToken
 * (a long base64url string meant for a URL, never typed), OTP needs a
 * 6-digit code. crypto.randomInt is a CSPRNG (unlike Math.random), uniform
 * over [0, 1_000_000).
 */
export function generateOtpCode(): { code: string; hash: string } {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  return { code, hash: hashOtpCode(code) };
}

export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Deterministic hash of a transaction's identifying details, binding an OTP
 * code to the exact context it was issued for. Verification re-derives this
 * from the submitted request body and rejects on mismatch -- stops a valid
 * {otpRequestId, code} pair from being replayed against a modified
 * amount/destination/recipient. Key order must stay fixed (JSON.stringify on
 * an object literal preserves insertion order for string keys), so callers
 * must build the input object with the same key order every time.
 */
export function hashContext(context: Record<string, string | number>): string {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

/**
 * Every money-moving OTP (WITHDRAWAL, DEPOSIT, ADMIN_PAYOUT) is a mandatory
 * security step, not an opt-in 2FA preference -- unlike AuthService.login's
 * twoFactorSmsEnabled gate, there's no per-user toggle to check here. Returns
 * the platform's configured phone channel (SMS or WHATSAPP, see
 * PlatformSettingsService.getOtpChannel/isWhatsappOtpEnabled) whenever the
 * user already has a verified phone number, otherwise EMAIL (there's no
 * phone to send to). WHATSAPP is only ever returned when
 * whatsappOtpEnabled is also true -- an admin flipping otpChannel to
 * "whatsapp" without finishing MailerSend setup (sender/template/API key)
 * falls back to SMS automatically, rather than routing every OTP to a
 * channel that can't actually deliver. This is not just a preference:
 * OtpService.deliver sends the code on BOTH the phone channel and email
 * whenever channel is SMS or WHATSAPP -- see its doc comment -- so a
 * thin/failing provider for the user's country never leaves them with zero
 * delivered codes.
 */
export async function resolveOtpDestination(
  user: {
    email: string;
    phoneNumber: string | null;
    phoneVerifiedAt: Date | null;
  },
  settings: { getOtpChannel(): Promise<string>; isWhatsappOtpEnabled(): Promise<boolean> },
): Promise<{ destination: string; channel: OtpChannel }> {
  if (user.phoneNumber && user.phoneVerifiedAt) {
    const [otpChannel, whatsappEnabled] = await Promise.all([
      settings.getOtpChannel(),
      settings.isWhatsappOtpEnabled(),
    ]);
    const channel: OtpChannel = otpChannel === 'whatsapp' && whatsappEnabled ? 'WHATSAPP' : 'SMS';
    return { destination: user.phoneNumber, channel };
  }
  return { destination: user.email, channel: 'EMAIL' };
}
