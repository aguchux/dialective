import * as jwt from 'jsonwebtoken';
import { Role } from '../generated/prisma/client';

export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
  role: Role;
}

const ACCESS_TOKEN_TTL = (process.env.ACCESS_TOKEN_TTL ?? '15m') as jwt.SignOptions['expiresIn'];

function getSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set');
  }
  return secret;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, getSecret()) as AccessTokenClaims;
}
