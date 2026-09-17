import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubscriberAnalyticsTimeSeriesPoint {
  date: string; // YYYY-MM-DD, UTC day bucket
  successfulRequests: number;
  failedRequests: number;
}

export interface SubscriberAnalyticsReport {
  totalRequests: number;
  audioRequests: number;
  totalBytesStreamed: string;
  totalHoursStreamed: number;
  deniedRequestRate: number;
  successRate: number;
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
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
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
        select: {
          bytesStreamed: true,
          durationStreamedMs: true,
          createdAt: true,
          deckId: true,
          recordingId: true,
          resultCode: true,
          entitlementDecision: true,
        },
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
    const totalDurationStreamedMs = audioRows.reduce(
      (sum, row) => sum + (row.durationStreamedMs ?? 0),
      0,
    );
    const deniedRequestRate =
      totalRequests > 0 ? Number((deniedCount / totalRequests).toFixed(4)) : 0;

    return {
      totalRequests,
      audioRequests: audioRows.length,
      totalBytesStreamed: totalBytesStreamed.toString(),
      totalHoursStreamed: Number((totalDurationStreamedMs / 3_600_000).toFixed(2)),
      deniedRequestRate,
      successRate: Number((1 - deniedRequestRate).toFixed(4)),
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

  /**
   * Doc section 62's usage chart -- day-bucketed successful/failed request
   * counts for the dashboard's API usage chart. Buckets in JS rather than a
   * $queryRaw date_trunc (no raw-SQL precedent anywhere else in this
   * codebase) since the underlying row volume this aggregates over the
   * default 30-day window is the same order of magnitude `build()` above
   * already pulls into memory for its own `rows` field.
   */
  async buildTimeSeries(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<SubscriberAnalyticsTimeSeriesPoint[]> {
    const rows = await this.prisma.streamAccessLog.findMany({
      where: { organizationId, createdAt: { gte: from, lte: to } },
      select: { createdAt: true, entitlementDecision: true },
    });

    const buckets = new Map<string, { successful: number; failed: number }>();
    for (const row of rows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(day) ?? { successful: 0, failed: 0 };
      if (row.entitlementDecision === 'allowed') bucket.successful += 1;
      else bucket.failed += 1;
      buckets.set(day, bucket);
    }

    const points: SubscriberAnalyticsTimeSeriesPoint[] = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    while (cursor <= end) {
      const day = cursor.toISOString().slice(0, 10);
      const bucket = buckets.get(day) ?? { successful: 0, failed: 0 };
      points.push({
        date: day,
        successfulRequests: bucket.successful,
        failedRequests: bucket.failed,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return points;
  }
}
