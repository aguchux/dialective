import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenClaims, verifyAccessToken } from '../jwt.util';

export interface OptionallyAuthenticatedRequest extends Request {
  user?: AccessTokenClaims;
}

/** Allows anonymous support chat but authenticates a supplied bearer token. */
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
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
