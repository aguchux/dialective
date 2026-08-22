import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@dialectiva/db';
import { AccessTokenClaims, verifyAccessToken } from '../jwt.util';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { AuthMaintenanceException } from '../auth-maintenance.exception';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenClaims;
}

/**
 * Access-token verification is otherwise stateless (no DB round-trip) -- the
 * refresh token, not the access token, is what's checked against Postgres,
 * so a short access-token TTL bounds how long a compromised access token is
 * useful without adding a DB hit to every request. The one exception is the
 * maintenance check below: PlatformSettingsService.getRow() is backed by a
 * 5s in-memory cache, so this adds a cheap, mostly-cached lookup rather than
 * a real per-request DB hit, in exchange for being able to log every active
 * session out (not just block new logins) when an admin enables
 * authMaintenanceBlockSessions.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const status = await this.platformSettings.getAuthMaintenanceStatus();
    if (status.enabled && status.blockSessions) {
      const role = request.user.role;
      const exempt =
        (role === Role.ADMIN && status.excludeAdmin) ||
        (role === Role.PARTNER && status.excludePartner);
      if (!exempt) {
        throw new AuthMaintenanceException(status.until!, status.message);
      }
    }

    return true;
  }
}
