import { createHash, randomBytes } from 'crypto';

/**
 * Opaque bearer tokens (refresh, password-reset, email-verification,
 * magic-link) follow the same pattern: generate a random value, return it
 * to the caller once, store only its SHA-256 hash. A DB leak alone can't be
 * replayed as a valid token.
 */
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
