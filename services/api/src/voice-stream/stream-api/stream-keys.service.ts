import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEventType, StreamKeyScope, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../auth/token.util';
import { WebhookEventService } from '../webhooks/webhook-event.service';
import { OrgActivityService } from '../org-activity/org-activity.service';

const KEY_PREFIX = 'dlsk_live_';
/** Chars of the raw token (after KEY_PREFIX) kept in keyPrefix for dashboard display -- long enough to tell keys apart at a glance, short enough that it alone can't be brute-forced into the full key. */
const DISPLAY_PREFIX_LENGTH = 8;

/** Every StreamApiKey field except keyHash -- keyHash must never leave the server in an HTTP response. */
const PUBLIC_KEY_SELECT = {
  id: true,
  organizationId: true,
  deckId: true,
  keyPrefix: true,
  scopes: true,
  allowedIps: true,
  createdByUserId: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;

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
    private readonly orgActivity: OrgActivityService,
  ) {}

  list(organizationId: string) {
    return this.prisma.streamApiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_KEY_SELECT,
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
      select: PUBLIC_KEY_SELECT,
    });

    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_CREATED, {
      organization_id: organizationId,
      key_id: row.id,
      key_prefix: row.keyPrefix,
      deck_id: row.deckId,
    });
    void this.orgActivity.record(organizationId, ActivityEventType.KEY_CREATED, createdByUserId, {
      keyId: row.id,
      keyPrefix: row.keyPrefix,
      deckId: row.deckId,
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

  async revoke(organizationId: string, keyId: string, actorUserId: string) {
    const key = await this.get(organizationId, keyId);
    const revoked = await this.prisma.streamApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
      select: PUBLIC_KEY_SELECT,
    });
    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_REVOKED, {
      organization_id: organizationId,
      key_id: revoked.id,
      key_prefix: revoked.keyPrefix,
    });
    void this.orgActivity.record(organizationId, ActivityEventType.KEY_REVOKED, actorUserId, {
      keyId: revoked.id,
      keyPrefix: revoked.keyPrefix,
    });
    return revoked;
  }

  /** Revokes the old key and mints a new one with the same deck/scope/IP config -- the old row is kept (audit trail), not deleted. */
  async rotate(organizationId: string, keyId: string, actorUserId: string) {
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
      select: PUBLIC_KEY_SELECT,
    });
    void this.webhookEvents.emit(organizationId, WebhookEventType.API_KEY_CREATED, {
      organization_id: organizationId,
      key_id: row.id,
      key_prefix: row.keyPrefix,
      deck_id: row.deckId,
    });
    void this.orgActivity.record(organizationId, ActivityEventType.KEY_ROTATED, actorUserId, {
      oldKeyId: existing.id,
      newKeyId: row.id,
      keyPrefix: row.keyPrefix,
    });

    return { ...row, plaintextKey: fullKey };
  }
}
