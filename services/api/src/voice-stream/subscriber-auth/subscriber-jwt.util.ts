import * as jwt from 'jsonwebtoken';
import { SubscriberOrgRole } from '@dialectiva/db';

export interface SubscriberAccessTokenClaims {
  sub: string; // SubscriberUser id
  email: string;
  organizationId: string;
  orgRole: SubscriberOrgRole;
}

const ACCESS_TOKEN_TTL = (process.env.STREAM_ACCESS_TOKEN_TTL ??
  '15m') as jwt.SignOptions['expiresIn'];

function getSecret(): string {
  const secret = process.env.STREAM_JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('STREAM_JWT_ACCESS_SECRET is not set');
  }
  return secret;
}

export function signSubscriberAccessToken(claims: SubscriberAccessTokenClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifySubscriberAccessToken(token: string): SubscriberAccessTokenClaims {
  // Pin the accepted algorithm to what we actually sign with (default HS256)
  // -- without this, jwt.verify() trusts whatever `alg` the token header
  // claims, opening the classic alg-confusion/"none" attack surface.
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as SubscriberAccessTokenClaims;
}
