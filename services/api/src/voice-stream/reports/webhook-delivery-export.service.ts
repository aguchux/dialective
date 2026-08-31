import { Injectable } from '@nestjs/common';
import { WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ROWS = 5_000;

export interface WebhookDeliveryExportFilters {
  eventType?: WebhookEventType;
  succeeded?: boolean;
}

/**
 * Raw WebhookDeliveryLog export across every subscription the org owns --
 * the existing WebhookSubscriptionsService.listDeliveries is per-subscription
 * (dashboard delivery-history view), this is the org-wide audit export.
 */
@Injectable()
export class WebhookDeliveryExportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, filters: WebhookDeliveryExportFilters) {
    const rows = await this.prisma.webhookDeliveryLog.findMany({
      where: {
        subscription: { organizationId },
        ...(filters.eventType ? { eventType: filters.eventType } : {}),
        ...(filters.succeeded !== undefined ? { succeeded: filters.succeeded } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      include: { subscription: { select: { url: true } } },
    });

    return {
      rows: rows.map((row) => ({
        createdAt: row.createdAt,
        subscriptionUrl: row.subscription.url,
        eventType: row.eventType,
        attemptNumber: row.attemptNumber,
        resultCode: row.resultCode,
        succeeded: row.succeeded,
        errorMessage: row.errorMessage,
      })),
    };
  }
}
