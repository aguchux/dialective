import { Injectable, NotFoundException } from '@nestjs/common';
import { StreamKeyScope, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../auth/token.util';
import { WebhookEventService } from '../webhooks/webhook-event.service';

const KEY_PREFIX = 'dlsk_live_';
/** Chars of the raw token (after KEY_PREFIX) kept in keyPrefix for dashboard display -- long enough to tell keys apart at a glance, short enough that it alone can't be brute-forced into the full key. */
const DISPLAY_PREFIX_LENGTH = 8;

function buildKey() {
  const { token, hash } = generateOpaqueToken();
  const fullKey = `${KEY_PREFIX}${token}`;
  return {
    fullKey,
    keyHash: hashToken(fullKey),
    keyPrefix: `${KEY_PREFIX}${token.slice(0, DISPLAY_PREFIX_LENGTH)}`,
  };
}

/**
 * Dashboard-side (JWT-authenticated, human) management of StreamApiKey rows
 * -- distinct from StreamKeyAuthGuard, which verifies the *presented* key on
 * machine-client requests to /stream/v1/*. See doc sections 26-28.
 */
@Injectable()
export class StreamKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  list(organizationId: string) {
    return this.prisma.streamApiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
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
    params: {
      deckId?: string;
      scopes: StreamKeyScope[];
      allowedIps?: string[];
      expiresAt?: string;
    },
  ) {
    if (params.deckId) {
      await this.assertDeckBelongsToOrg(organizationId, params.deckId);
    }

    const { fullKey, keyHash, keyPrefix } = buildKey();
    const row = await this.prisma.streamApiKey.create({
      data: {
        organizationId,
        deckId: params.deckId ?? null,
        keyHash,
        keyPrefix,
        scopes: params.scopes,
        allowedIps: params.allowedIps ?? [],
        createdByUserId,
        expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
      },
    });

    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_CREATED, {
      organization_id: organizationId,
      key_id: row.id,
      key_prefix: row.keyPrefix,
      deck_id: row.deckId,
    });

    return { ...row, plaintextKey: fullKey };
  }

  private async get(organizationId: string, keyId: string) {
    const key = await this.prisma.streamApiKey.findUnique({ where: { id: keyId } });
    if (!key || key.organizationId !== organizationId) {
      throw new NotFoundException('Stream Key not found');
    }
    return key;
  }

  async revoke(organizationId: string, keyId: string) {
    const key = await this.get(organizationId, keyId);
    const revoked = await this.prisma.streamApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_REVOKED, {
      organization_id: organizationId,
      key_id: revoked.id,
      key_prefix: revoked.keyPrefix,
    });
    return revoked;
  }

  /** Revokes the old key and mints a new one with the same deck/scope/IP config -- the old row is kept (audit trail), not deleted. */
  async rotate(organizationId: string, keyId: string) {
    const existing = await this.get(organizationId, keyId);
    await this.prisma.streamApiKey.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_REVOKED, {
      organization_id: organizationId,
      key_id: existing.id,
      key_prefix: existing.keyPrefix,
    });

    const { fullKey, keyHash, keyPrefix } = buildKey();
    const row = await this.prisma.streamApiKey.create({
      data: {
        organizationId,
        deckId: existing.deckId,
        keyHash,
        keyPrefix,
        scopes: existing.scopes,
        allowedIps: existing.allowedIps,
        createdByUserId: existing.createdByUserId,
        expiresAt: existing.expiresAt,
      },
    });
    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_CREATED, {
      organization_id: organizationId,
      key_id: row.id,
      key_prefix: row.keyPrefix,
      deck_id: row.deckId,
    });

    return { ...row, plaintextKey: fullKey };
  }
}
