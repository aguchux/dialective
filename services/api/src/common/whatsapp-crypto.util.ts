import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM encrypt/decrypt for PlatformSettings.whatsappApiKeyEncrypted --
 * structurally identical to kyc-crypto.util.ts/payout-crypto.util.ts, but
 * keyed by a separate WHATSAPP_SETTINGS_ENCRYPTION_KEY so a leaked payout or
 * KYC key never also exposes the MailerSend API key (different blast
 * radius/rotation lifecycle). Unlike SMS provider credentials (env-only,
 * read directly inside each provider class), the WhatsApp API key is
 * admin-rotatable from the settings panel without a redeploy -- see
 * WhatsappMessagingSettingsPanel.tsx -- so it must live in the DB, encrypted
 * rather than plaintext.
 */
const KEY_DERIVATION_SALT = 'dialectiva-whatsapp-settings-v1';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  const passphrase = process.env.WHATSAPP_SETTINGS_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error('WHATSAPP_SETTINGS_ENCRYPTION_KEY is not set');
  }
  return scryptSync(passphrase, KEY_DERIVATION_SALT, 32);
}

export interface EncryptedWhatsappField {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export function encryptWhatsappField(plaintext: string): EncryptedWhatsappField {
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

export function decryptWhatsappField(field: EncryptedWhatsappField): string {
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(field.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(field.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(field.encryptedValue, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Masks all but the last 4 characters, e.g. "****3ab9", for display on the admin settings screen -- the full key is never returned to the client once saved. */
export function maskWhatsappApiKey(value: string): string {
  const visible = 4;
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
