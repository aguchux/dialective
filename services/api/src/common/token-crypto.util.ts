import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM encrypt/decrypt for ApiAccessToken.encryptedValue -- the only
 * reversible-encryption use in this codebase (everything else, e.g.
 * auth/token.util.ts's OTP/session tokens, is one-way hashed since those
 * never need to be read back). Keyed by API_TOKEN_ENCRYPTION_KEY, which both
 * `api` and whisper-worker must be given identically (see db.py's
 * get_hf_token) -- api writes ciphertext via set(), whisper-worker decrypts
 * it directly since it can't call back into api's DI container.
 *
 * scryptSync derives a fixed 32-byte key from whatever string is in the env
 * var (rather than requiring the operator to hand-generate exactly 32 random
 * bytes) -- the salt is a fixed, non-secret constant (safe for a KDF whose
 * only job is "stretch this one long-lived passphrase to the right length",
 * not password storage where a unique salt matters).
 */
const KEY_DERIVATION_SALT = 'dialectiva-api-access-token-v1';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  const passphrase = process.env.API_TOKEN_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error('API_TOKEN_ENCRYPTION_KEY is not set');
  }
  return scryptSync(passphrase, KEY_DERIVATION_SALT, 32);
}

export interface EncryptedToken {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export function encryptToken(plaintext: string): EncryptedToken {
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

export function decryptToken(token: EncryptedToken): string {
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(token.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(token.authTag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(token.encryptedValue, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
