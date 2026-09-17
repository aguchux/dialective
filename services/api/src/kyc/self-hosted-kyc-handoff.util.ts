import * as jwt from 'jsonwebtoken';

/**
 * Short-lived, single-purpose token for the trainer-dashboard -> DLKYC
 * (kyc.dialectlibrary.com) redirect handoff. Deliberately NOT the platform's
 * normal access token (jwt.util.ts's signAccessToken) -- that token is
 * broadly scoped and long-lived-enough to be dangerous in a URL query
 * string. This token can only ever resume one specific KycVerification row
 * for one specific user, and expires quickly since the whole redirect round
 * trip is expected to complete in well under its TTL. Signed with the same
 * JWT_ACCESS_SECRET as the platform's access tokens (no new secret to
 * provision/rotate) but under its own `typ` claim so verifyHandoffToken can
 * never be fooled by a normal access token or vice versa.
 */
export interface KycHandoffTokenClaims {
  typ: 'kyc-handoff';
  sub: string; // user id
  verificationId: string;
  callbackUrl: string;
}

const HANDOFF_TOKEN_TTL = (process.env.KYC_HANDOFF_TOKEN_TTL ??
  '10m') as jwt.SignOptions['expiresIn'];

function getSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set');
  }
  return secret;
}

export function signKycHandoffToken(claims: Omit<KycHandoffTokenClaims, 'typ'>): string {
  return jwt.sign({ ...claims, typ: 'kyc-handoff' }, getSecret(), {
    expiresIn: HANDOFF_TOKEN_TTL,
  });
}

export function verifyKycHandoffToken(token: string): KycHandoffTokenClaims {
  const claims = jwt.verify(token, getSecret()) as KycHandoffTokenClaims;
  if (claims.typ !== 'kyc-handoff') {
    throw new Error('Not a KYC handoff token');
  }
  return claims;
}
