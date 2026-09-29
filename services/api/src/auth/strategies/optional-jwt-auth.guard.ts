import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenClaims, verifyAccessToken } from '../jwt.util';

export interface OptionallyAuthenticatedRequest extends Request {
  user?: AccessTokenClaims;
}

/**
 * Authenticates a supplied bearer token, and lets the request through as
 * anonymous when it can't.
 *
 * An expired or otherwise unverifiable token is treated exactly like no
 * token at all: `request.user` stays undefined and the route serves its
 * public response. It must not 401. Every route behind this guard has a
 * meaningful anonymous behaviour -- community feeds are public and
 * shareable, support chat answers signed-out visitors -- so rejecting a
 * stale token denies content the same caller could have had by sending no
 * token whatsoever.
 *
 * That asymmetry was a live outage: a signed-in community.dialectlibrary.com
 * viewer whose 15-minute access token had expired got 401 on every feed
 * while signed-out visitors loaded them fine, because community's app only
 * decodes the shared session cookie and never renews the token inside it
 * (see community/lib/auth-options.ts -- it deliberately has no refresh
 * path, since two apps rotating one refresh-token family would revoke it).
 * The site still showed them as signed in, so the failure read as "the
 * community is broken" rather than "your session lapsed".
 *
 * A malformed Authorization header is still rejected, because that is a
 * caller bug rather than a lapsed session -- nothing routine produces it,
 * and failing loudly keeps it from being mistaken for a route that ignores
 * credentials.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OptionallyAuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header) return true;
    if (!header.startsWith('Bearer '))
      throw new UnauthorizedException('Invalid authorization header');
    try {
      request.user = verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      // Expired or invalid: proceed anonymously rather than 401.
      request.user = undefined;
    }
    return true;
  }
}
