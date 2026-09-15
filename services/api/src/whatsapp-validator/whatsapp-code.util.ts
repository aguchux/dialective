import { randomInt } from 'crypto';
import { hashOtpCode } from '../otp/otp.util';

// Excludes 0/O and 1/I/L -- easy to mis-hear/mis-type when relayed by voice
// or a quick WhatsApp text between two peers, unlike the numeric-only
// generateOtpCode() this deliberately doesn't share (that one's used by
// money-moving OTP flows where a fixed digit-only format is a known
// external contract, e.g. SMS delivery expectations).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** WhatsApp Validator's own code format -- 6-char uppercase alphanumeric, reusing hashOtpCode's plain SHA-256 (hashing is format-agnostic). */
export function generateWhatsAppCode(): { code: string; hash: string } {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return { code, hash: hashOtpCode(code) };
}
