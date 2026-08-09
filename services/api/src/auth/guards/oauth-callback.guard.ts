import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
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
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid callback secret');
    }
    return true;
  }
}
