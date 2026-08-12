import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * /auth/magic-link/callback is called server-to-server by frontend's
 * NextAuth callback (after NextAuth has already consumed the magic-link
 * token) -- never directly by a browser. A shared secret keeps this from
 * being an open "create/verify any user" endpoint, since it deliberately
 * has no user-supplied password to check.
 */
@Injectable()
export class OAuthCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-oauth-callback-secret'];
    const expected = process.env.OAUTH_CALLBACK_SECRET;

    if (!expected) {
      throw new Error('OAUTH_CALLBACK_SECRET is not set');
    }
    const value = Array.isArray(provided) ? provided[0] : provided;
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(value ?? '');
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException('Invalid callback secret');
    }
    return true;
  }
}
