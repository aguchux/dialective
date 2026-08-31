import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { StreamKeyScope } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../../auth/token.util';

export interface AuthenticatedStreamKeyRequest extends Request {
  streamKey: {
    id: string;
    organizationId: string;
    deckId: string | null;
    scopes: StreamKeyScope[];
    /** Which table `id` points into -- StreamKeyAuthGuard sets 'stream_key', OAuthJwtAuthGuard sets 'oauth_client' (both populate this same request shape). */
    credentialType: 'stream_key' | 'oauth_client';
  };
}

/**
 * Verifies the Stream Key presented by an external/programmatic client on
 * /stream/v1/* routes (doc section 35, steps 1-3). Deliberately DB-backed
 * rather than stateless-JWT-verified like SubscriberAuthGuard -- API keys
 * must be revocable instantly (a leaked key can't wait out a token TTL),
 * which requires a lookup on every request. lastUsedAt is updated
 * fire-and-forget so a slow write never adds latency to the actual request.
 */
@Injectable()
export class StreamKeyAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const presented = header.slice('Bearer '.length);
    const keyHash = hashToken(presented);
    const key = await this.prisma.streamApiKey.findUnique({ where: { keyHash } });

    if (!key) {
      throw new UnauthorizedException('Invalid Stream Key');
    }
    if (key.revokedAt) {
      throw new UnauthorizedException('This Stream Key has been revoked');
    }
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This Stream Key has expired');
    }
    if (key.allowedIps.length > 0 && request.ip && !key.allowedIps.includes(request.ip)) {
      throw new UnauthorizedException('Request IP is not on this Stream Key\'s allowlist');
    }

    request.streamKey = {
      id: key.id,
      organizationId: key.organizationId,
      deckId: key.deckId,
      scopes: key.scopes,
      credentialType: 'stream_key',
    };

    void this.prisma.streamApiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }
}
