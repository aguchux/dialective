import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SubscriberAccessTokenClaims, verifySubscriberAccessToken } from './subscriber-jwt.util';

export interface AuthenticatedSubscriberRequest extends Request {
  user: SubscriberAccessTokenClaims;
}

/**
 * Mirrors auth/strategies/jwt-auth.guard.ts's shape (stateless bearer-token
 * verification) but deliberately omits the trainer maintenance-mode check --
 * that's a trainer-platform concept, irrelevant to Voice Stream subscribers.
 */
@Injectable()
export class SubscriberAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = verifySubscriberAccessToken(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return true;
  }
}
