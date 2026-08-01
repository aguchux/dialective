import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenClaims, verifyAccessToken } from '../jwt.util';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenClaims;
}

/**
 * Stateless access-token verification (no DB round-trip) -- the refresh
 * token, not the access token, is what's checked against Postgres, so a
 * short access-token TTL bounds how long a compromised access token is
 * useful without adding a DB hit to every request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = verifyAccessToken(header.slice('Bearer '.length));
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
