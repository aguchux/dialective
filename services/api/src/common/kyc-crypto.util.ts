import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM encrypt/decrypt for KycVerification.decisionEncryptedJson --
 * structurally identical to payout-crypto.util.ts, but keyed by a separate
 * KYC_DOCUMENT_ENCRYPTION_KEY rather than PAYOUT_ACCOUNT_ENCRYPTION_KEY,
 * since a leaked payout-account key should not also expose ID document
 * numbers/DOB (different blast radius/rotation lifecycle). Only the masked/
 * display subset (documentType, faceMatchScore, etc.) is ever stored
 * plaintext on KycVerification -- the full Didit decision payload is only
 * ever decrypted for an admin's explicit "view full decision" action.
 */
const KEY_DERIVATION_SALT = 'dialectiva-kyc-document-v1';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  const passphrase = process.env.KYC_DOCUMENT_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error('KYC_DOCUMENT_ENCRYPTION_KEY is not set');
  }
  return scryptSync(passphrase, KEY_DERIVATION_SALT, 32);
}

export interface EncryptedKycField {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export function encryptKycField(plaintext: string): EncryptedKycField {
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

export function decryptKycField(field: EncryptedKycField): string {
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
export function maskDocumentNumber(value: string, visibleDigits = 4): string {
  if (value.length <= visibleDigits) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visibleDigits) + value.slice(-visibleDigits);
}
