import { decryptToken, encryptToken } from './token-crypto.util';

describe('token-crypto.util', () => {
  const originalKey = process.env.API_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.API_TOKEN_ENCRYPTION_KEY = 'test-passphrase-do-not-use-in-prod';
  });

  afterAll(() => {
    process.env.API_TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips a plaintext value through encrypt then decrypt', () => {
    const encrypted = encryptToken('hf_super_secret_token_value');
    expect(decryptToken(encrypted)).toBe('hf_super_secret_token_value');
  });

  it('produces a different iv/ciphertext on each call (no nonce reuse)', () => {
    const a = encryptToken('same-plaintext');
    const b = encryptToken('same-plaintext');
    expect(a.iv).not.toBe(b.iv);
    expect(a.encryptedValue).not.toBe(b.encryptedValue);
  });

  it('throws when the auth tag has been tampered with', () => {
    const encrypted = encryptToken('hf_super_secret_token_value');
    const tampered = { ...encrypted, authTag: Buffer.from('0'.repeat(32)).toString('base64') };
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('throws when API_TOKEN_ENCRYPTION_KEY is not set', () => {
    delete process.env.API_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken('value')).toThrow('API_TOKEN_ENCRYPTION_KEY is not set');
  });
});
