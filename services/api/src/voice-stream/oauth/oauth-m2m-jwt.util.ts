import * as jwt from 'jsonwebtoken';
import { StreamKeyScope, VdclPurpose } from '@dialectiva/db';

export interface M2mTokenClaims {
  sub: string; // OAuthClient.clientId
  organizationId: string;
  deckId: string | null;
  scopes: StreamKeyScope[];
  /**
   * Declared VDCL purposes for this credential's traffic. Optional in the
   * type because a token minted before this field existed will not carry it;
   * an absent/empty value is treated as "not declared" and denied under VDCL
   * enforcement, never defaulted to a permissive purpose.
   */
  purposes?: VdclPurpose[];
}

/**
 * Short TTL by design (5m default) -- unlike Stream Keys (DB-backed,
 * instantly revocable via StreamKeyAuthGuard's per-request lookup), an M2M
 * JWT is verified statelessly with no DB hit, so it can't be revoked mid-
 * flight. A short TTL bounds how long a leaked/stale token stays usable,
 * trading instant revocability for lower per-request latency -- the
 * explicit tradeoff this feature was scoped around.
 */
const M2M_TOKEN_TTL = (process.env.OAUTH_M2M_TOKEN_TTL ?? '5m') as jwt.SignOptions['expiresIn'];

function getSecret(): string {
  const secret = process.env.OAUTH_M2M_JWT_SECRET;
  if (!secret) {
    throw new Error('OAUTH_M2M_JWT_SECRET is not set');
  }
  return secret;
}

export function signM2mToken(claims: M2mTokenClaims): { token: string; expiresInSeconds: number } {
  const token = jwt.sign(claims, getSecret(), { expiresIn: M2M_TOKEN_TTL });
  const decoded = jwt.decode(token) as { exp: number; iat: number };
  return { token, expiresInSeconds: decoded.exp - decoded.iat };
}

export function verifyM2mToken(token: string): M2mTokenClaims {
  // Pin the accepted algorithm to what we actually sign with (default HS256)
  // -- without this, jwt.verify() trusts whatever `alg` the token header
  // claims, opening the classic alg-confusion/"none" attack surface.
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as M2mTokenClaims;
}
