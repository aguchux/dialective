import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ROWS = 5_000;

export interface AccessLogExportFilters {
  from?: Date;
  to?: Date;
  entitlementDecision?: string;
  requestType?: string;
  deckId?: string;
  streamApiKeyId?: string;
}

/**
 * Raw, unaggregated StreamAccessLog rows -- distinct from
 * SubscriberAnalyticsService, which only ever returns aggregates. This is
 * the actual audit trail export: every request, allow or deny, with full
 * ipAddress/userAgent/entitlementDecision detail. Capped at MAX_ROWS
 * (newest first) rather than paginated -- a CSV export is a one-shot pull,
 * not a browsable list.
 */
@Injectable()
export class AccessLogExportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, filters: AccessLogExportFilters) {
    const where = {
      organizationId,
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
      ...(filters.entitlementDecision ? { entitlementDecision: filters.entitlementDecision } : {}),
      ...(filters.requestType ? { requestType: filters.requestType } : {}),
      ...(filters.deckId ? { deckId: filters.deckId } : {}),
      ...(filters.streamApiKeyId ? { streamApiKeyId: filters.streamApiKeyId } : {}),
    };

    const rows = await this.prisma.streamAccessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });

    return {
      rows: rows.map((row) => ({
        createdAt: row.createdAt,
        credentialType: row.credentialType,
        streamApiKeyId: row.streamApiKeyId,
        deckId: row.deckId,
        recordingId: row.recordingId,
        requestType: row.requestType,
        resultCode: row.resultCode,
        entitlementDecision: row.entitlementDecision,
        bytesStreamed: row.bytesStreamed?.toString() ?? null,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      })),
    };
  }
}
