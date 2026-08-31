import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyM2mToken } from './oauth-m2m-jwt.util';
import { AuthenticatedStreamKeyRequest } from '../stream-api/stream-key-auth.guard';

/**
 * Verifies an M2M JWT statelessly (no DB hit, unlike StreamKeyAuthGuard's
 * per-request lookup -- the actual value-add of OAuth M2M over a Stream
 * Key). Populates request.streamKey in the exact same shape
 * StreamKeyAuthGuard produces, so every downstream guard/controller
 * (StreamKeyScopesGuard, ConcurrentStreamGuard, StreamKeyRateLimitGuard,
 * StreamAudioController, StreamManifestService/Controller) accepts either
 * credential type with zero changes -- they only ever read
 * request.streamKey's shape, never which guard populated it.
 */
@Injectable()
export class OAuthJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const claims = verifyM2mToken(header.slice('Bearer '.length));
      request.streamKey = {
        id: claims.sub,
        organizationId: claims.organizationId,
        deckId: claims.deckId,
        scopes: claims.scopes,
        credentialType: 'oauth_client',
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
