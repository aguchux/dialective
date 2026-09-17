import * as jwt from 'jsonwebtoken';

/**
 * Signed, single-purpose token proving WHEN a Dialect Validation item was
 * actually served to a validator -- issued by WordValidationService.nextItem,
 * required back on submit(). This is the server's own clock, not a
 * client-reported duration (which would be trivially spoofable) -- submit()
 * checks `now - issuedAt` against PlatformSettings.dialectValidationMinSeconds
 * to reject rapid/no-listen submissions. Deliberately NOT a correctness gate
 * -- see submit()'s doc comment: isCorrectMatch never blocks payout, since a
 * validator flagging a bad recording is doing their job right, not farming.
 * Same signing convention as self-hosted-kyc-handoff.util.ts (reuses
 * JWT_ACCESS_SECRET, no new secret to provision/rotate), under its own `typ`
 * claim so it can never be confused with a normal access token or the KYC
 * handoff token.
 */
export interface WordValidationPresentmentClaims {
  typ: 'word-validation-presentment';
  sub: string; // validator's user id
  recordingId: string;
}

// Generous -- long enough that a validator who gets distracted mid-item
// doesn't lose their in-progress work, short enough that a token can't be
// stockpiled and replayed across a farming session.
const PRESENTMENT_TOKEN_TTL = (process.env.WORD_VALIDATION_PRESENTMENT_TOKEN_TTL ??
  '30m') as jwt.SignOptions['expiresIn'];

function getSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set');
  }
  return secret;
}

export function signWordValidationPresentmentToken(
  claims: Omit<WordValidationPresentmentClaims, 'typ'>,
): string {
  return jwt.sign({ ...claims, typ: 'word-validation-presentment' }, getSecret(), {
    expiresIn: PRESENTMENT_TOKEN_TTL,
  });
}

/** Returns null (never throws) on a missing/expired/malformed/mismatched token -- callers treat that as "no proof of presentment time," not a hard error, since the item itself may still be valid to submit. */
export function verifyWordValidationPresentmentToken(
  token: string,
  expected: { userId: string; recordingId: string },
): { issuedAt: Date } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as WordValidationPresentmentClaims & {
      iat: number;
    };
    if (
      decoded.typ !== 'word-validation-presentment' ||
      decoded.sub !== expected.userId ||
      decoded.recordingId !== expected.recordingId
    ) {
      return null;
    }
    return { issuedAt: new Date(decoded.iat * 1000) };
  } catch {
    return null;
  }
}
