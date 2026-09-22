import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEventType, StreamKeyScope } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../auth/token.util';
import { OrgActivityService } from '../org-activity/org-activity.service';

const CLIENT_ID_PREFIX = 'dlm2m_';

/** Every OAuthClient field except secretHash -- secretHash must never leave the server in an HTTP response. */
const PUBLIC_CLIENT_SELECT = {
  id: true,
  organizationId: true,
  deckId: true,
  clientId: true,
  scopes: true,
  purposes: true,
  createdByUserId: true,
  createdAt: true,
  revokedAt: true,
} as const;

function buildClient() {
  const { token: clientIdSuffix } = generateOpaqueToken();
  const { token: secret, hash: secretHash } = generateOpaqueToken();
  return {
    clientId: `${CLIENT_ID_PREFIX}${clientIdSuffix}`,
    secret,
    secretHash,
  };
}

/**
 * Dashboard-side (JWT-authenticated, human) management of OAuthClient rows
 * -- distinct from the token endpoint (oauth-token.controller.ts), which
 * verifies a *presented* client_id/client_secret pair from a machine
 * client. Exact template: stream-keys.service.ts.
 */
@Injectable()
export class OAuthClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  list(organizationId: string) {
    return this.prisma.oAuthClient.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_CLIENT_SELECT,
    });
  }

  private async assertDeckBelongsToOrg(organizationId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.streamDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.organizationId !== organizationId) {
      throw new NotFoundException('Stream Deck not found');
    }
  }

  async create(
    organizationId: string,
    createdByUserId: string,
    params: { deckId?: string; scopes: StreamKeyScope[] },
  ) {
    if (params.deckId) {
      await this.assertDeckBelongsToOrg(organizationId, params.deckId);
    }

    const { clientId, secret, secretHash } = buildClient();
    const row = await this.prisma.oAuthClient.create({
      data: {
        organizationId,
        deckId: params.deckId ?? null,
        clientId,
        secretHash,
        scopes: params.scopes,
        createdByUserId,
      },
      select: PUBLIC_CLIENT_SELECT,
    });

    void this.orgActivity.record(
      organizationId,
      ActivityEventType.OAUTH_CLIENT_CREATED,
      createdByUserId,
      {
        clientId: row.clientId,
        deckId: row.deckId,
      },
    );

    return { ...row, plaintextSecret: secret };
  }

  private async get(organizationId: string, id: string) {
    const client = await this.prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.organizationId !== organizationId) {
      throw new NotFoundException('OAuth client not found');
    }
    return client;
  }

  async revoke(organizationId: string, id: string, actorUserId: string) {
    const client = await this.get(organizationId, id);
    const revoked = await this.prisma.oAuthClient.update({
      where: { id: client.id },
      data: { revokedAt: new Date() },
      select: PUBLIC_CLIENT_SELECT,
    });
    void this.orgActivity.record(
      organizationId,
      ActivityEventType.OAUTH_CLIENT_REVOKED,
      actorUserId,
      {
        clientId: revoked.clientId,
      },
    );
    return revoked;
  }
}
