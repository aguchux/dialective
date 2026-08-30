import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptToken, decryptToken } from '../../common/token-crypto.util';

const SECRET_BYTES = 32;

/**
 * Dashboard-side (JWT-authenticated, human) management of
 * WebhookSubscription rows -- distinct from WebhookDeliveryConsumerService,
 * which reads these rows to actually deliver events. Signing secrets are
 * reversibly encrypted (common/token-crypto.util.ts, same AES-256-GCM
 * shape as ApiAccessToken) since the server must read them back on every
 * delivery to compute the outbound HMAC -- unlike a Stream Key, which is
 * only ever hash-compared and never decrypted.
 */
@Injectable()
export class WebhookSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        url: true,
        eventTypes: true,
        active: true,
        createdByUserId: true,
        createdAt: true,
      },
    });
  }

  async create(
    organizationId: string,
    createdByUserId: string,
    params: { url: string; eventTypes: WebhookEventType[] },
  ) {
    const secret = randomBytes(SECRET_BYTES).toString('hex');
    const { encryptedValue, iv, authTag } = encryptToken(secret);

    const row = await this.prisma.webhookSubscription.create({
      data: {
        organizationId,
        url: params.url,
        eventTypes: params.eventTypes,
        encryptedSecret: encryptedValue,
        secretIv: iv,
        secretAuthTag: authTag,
        createdByUserId,
      },
    });

    return {
      id: row.id,
      organizationId: row.organizationId,
      url: row.url,
      eventTypes: row.eventTypes,
      active: row.active,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      plaintextSecret: secret,
    };
  }

  private async get(organizationId: string, id: string) {
    const row = await this.prisma.webhookSubscription.findUnique({ where: { id } });
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Webhook subscription not found');
    }
    return row;
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const row = await this.get(organizationId, id);
    await this.prisma.webhookSubscription.delete({ where: { id: row.id } });
  }

  async listDeliveries(organizationId: string, id: string) {
    await this.get(organizationId, id);
    return this.prisma.webhookDeliveryLog.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Server-side only -- never exposed via a controller route. Used by WebhookDeliveryConsumerService to compute the outbound HMAC. */
  async getDecryptedSecret(id: string): Promise<string | null> {
    const row = await this.prisma.webhookSubscription.findUnique({ where: { id } });
    if (!row) return null;
    return decryptToken({
      encryptedValue: row.encryptedSecret,
      iv: row.secretIv,
      authTag: row.secretAuthTag,
    });
  }

  /** Used by WebhookDeliveryConsumerService to find every active subscription for an org listening to a given event type. */
  async findActiveSubscribers(organizationId: string, eventType: WebhookEventType) {
    return this.prisma.webhookSubscription.findMany({
      where: { organizationId, active: true, eventTypes: { has: eventType } },
    });
  }
}
