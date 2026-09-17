import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { StreamKeyAuthGuard } from '../stream-api/stream-key-auth.guard';
import { OAuthJwtAuthGuard } from './oauth-jwt-auth.guard';

/**
 * Dispatches to StreamKeyAuthGuard or OAuthJwtAuthGuard based on bearer
 * token shape, so /stream/v1/* routes accept either credential type
 * without a try/catch-based composite guard (which would mean every
 * OAuth-authenticated request first pays for a failed Stream Key DB
 * lookup). A JWT is always 3 dot-separated segments; an opaque Stream Key
 * (base64url, "dlsk_live_..." prefixed) never contains two dots.
 */
@Injectable()
export class EitherStreamCredentialGuard implements CanActivate {
  constructor(
    private readonly streamKeyGuard: StreamKeyAuthGuard,
    private readonly oauthGuard: OAuthJwtAuthGuard,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const looksLikeJwt =
      header?.startsWith('Bearer ') && header.slice('Bearer '.length).split('.').length === 3;

    return looksLikeJwt
      ? this.oauthGuard.canActivate(context)
      : this.streamKeyGuard.canActivate(context);
  }
}
