import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubscriberAnalyticsReport {
  totalRequests: number;
  audioRequests: number;
  totalBytesStreamed: string;
  deniedRequestRate: number;
  requestsByType: Record<string, number>;
  topDecksByRequests: { deckId: string | null; requests: number }[];
  rows: Record<string, unknown>[];
}

/**
 * Doc section 62's "subscriber analytics" -- aggregates StreamAccessLog
 * (already indexed [organizationId, createdAt]) into a usage summary.
 * Mirrors StreamManifestService.getUsageSummary's `where` construction but
 * expands into a fuller report (per-type breakdown, denial rate, top
 * decks) rather than a single running total.
 */
@Injectable()
export class SubscriberAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, from?: Date, to?: Date): Promise<SubscriberAnalyticsReport> {
    const where = {
      organizationId,
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [totalRequests, byType, byResult, byDeck, audioRows] = await Promise.all([
      this.prisma.streamAccessLog.count({ where }),
      this.prisma.streamAccessLog.groupBy({
        by: ['requestType'],
        where,
        _count: { _all: true },
      }),
      this.prisma.streamAccessLog.groupBy({
        by: ['entitlementDecision'],
        where,
        _count: { _all: true },
      }),
      this.prisma.streamAccessLog.groupBy({
        by: ['deckId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { deckId: 'desc' } },
        take: 10,
      }),
      this.prisma.streamAccessLog.findMany({
        where: { ...where, requestType: 'audio' },
        select: { bytesStreamed: true, createdAt: true, deckId: true, recordingId: true, resultCode: true, entitlementDecision: true },
      }),
    ]);

    const requestsByType: Record<string, number> = {};
    for (const row of byType) requestsByType[row.requestType] = row._count._all;

    const deniedCount = byResult
      .filter((row) => row.entitlementDecision !== 'allowed')
      .reduce((sum, row) => sum + row._count._all, 0);

    const totalBytesStreamed = audioRows.reduce(
      (sum, row) => sum + (row.bytesStreamed ?? BigInt(0)),
      BigInt(0),
    );

    return {
      totalRequests,
      audioRequests: audioRows.length,
      totalBytesStreamed: totalBytesStreamed.toString(),
      deniedRequestRate: totalRequests > 0 ? Number((deniedCount / totalRequests).toFixed(4)) : 0,
      requestsByType,
      topDecksByRequests: byDeck.map((row) => ({ deckId: row.deckId, requests: row._count._all })),
      rows: audioRows.map((row) => ({
        createdAt: row.createdAt,
        deckId: row.deckId,
        recordingId: row.recordingId,
        bytesStreamed: (row.bytesStreamed ?? BigInt(0)).toString(),
        resultCode: row.resultCode,
        entitlementDecision: row.entitlementDecision,
      })),
    };
  }
}
