import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM encrypt/decrypt for PayoutAccount/WithdrawalRequest bank and
 * mobile-money account numbers -- structurally identical to
 * token-crypto.util.ts, but keyed by a separate PAYOUT_ACCOUNT_ENCRYPTION_KEY
 * rather than API_TOKEN_ENCRYPTION_KEY, since a leaked API-token key should
 * not also expose trainer bank details (different blast radius/rotation
 * lifecycle). The masked display value (e.g. ****1234) is computed and
 * stored in plaintext at write time, never re-derived by decrypting, so
 * ordinary reads/logs never touch the decrypt path at all.
 */
const KEY_DERIVATION_SALT = 'dialectiva-payout-account-v1';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  const passphrase = process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error('PAYOUT_ACCOUNT_ENCRYPTION_KEY is not set');
  }
  return scryptSync(passphrase, KEY_DERIVATION_SALT, 32);
}

export interface EncryptedPayoutField {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export function encryptPayoutField(plaintext: string): EncryptedPayoutField {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptPayoutField(field: EncryptedPayoutField): string {
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(field.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(field.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(field.encryptedValue, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Masks all but the last `visibleDigits` characters, e.g. "****1234". */
export function maskAccountNumber(value: string, visibleDigits = 4): string {
  if (value.length <= visibleDigits) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visibleDigits) + value.slice(-visibleDigits);
}
