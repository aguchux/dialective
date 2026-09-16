import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const BREAKDOWN_TOP_N = 10;

/**
 * Reads the AnalyticsDailySnapshot/AnalyticsDailyBreakdown rows written by
 * the google-analytics-job CronJob (services/google-analytics-job) --
 * purely a read layer, this service never calls the GA Data API itself
 * (that only happens in the job, on its own schedule), so an admin
 * opening this report is always reading from our own DB, not Google's.
 */
@Injectable()
export class AnalyticsReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(days = DEFAULT_DAYS) {
    const clampedDays = Math.min(Math.max(days, 1), MAX_DAYS);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - clampedDays);
    since.setUTCHours(0, 0, 0, 0);

    const [snapshots, lastFetch] = await Promise.all([
      this.prisma.analyticsDailySnapshot.findMany({
        where: { date: { gte: since } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.analyticsDailySnapshot.findFirst({
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      }),
    ]);

    const totals = snapshots.reduce(
      (acc, row) => ({
        activeUsers: acc.activeUsers + row.activeUsers,
        newUsers: acc.newUsers + row.newUsers,
        sessions: acc.sessions + row.sessions,
        screenPageViews: acc.screenPageViews + row.screenPageViews,
        conversions: acc.conversions + row.conversions,
      }),
      { activeUsers: 0, newUsers: 0, sessions: 0, screenPageViews: 0, conversions: 0 },
    );

    return {
      configured: lastFetch !== null,
      lastFetchedAt: lastFetch?.fetchedAt ?? null,
      days: clampedDays,
      totals,
      daily: snapshots.map((row) => ({
        date: row.date,
        activeUsers: row.activeUsers,
        newUsers: row.newUsers,
        sessions: row.sessions,
        screenPageViews: row.screenPageViews,
        averageSessionSeconds: row.averageSessionSeconds.toString(),
        engagementRate: row.engagementRate.toString(),
        conversions: row.conversions,
      })),
    };
  }

  /** Top-N breakdown rows for one dimension ("page" | "country" | "deviceCategory"), summed across the window rather than per-day -- an admin wants "top pages this month," not a day-by-day page ranking. */
  async getBreakdown(dimension: string, days = DEFAULT_DAYS) {
    const clampedDays = Math.min(Math.max(days, 1), MAX_DAYS);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - clampedDays);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.prisma.analyticsDailyBreakdown.groupBy({
      by: ['dimensionValue'],
      where: { dimension, date: { gte: since } },
      _sum: { activeUsers: true, screenPageViews: true },
      orderBy: { _sum: { activeUsers: 'desc' } },
      take: BREAKDOWN_TOP_N,
    });

    return rows.map((row) => ({
      value: row.dimensionValue,
      activeUsers: row._sum.activeUsers ?? 0,
      screenPageViews: row._sum.screenPageViews ?? 0,
    }));
  }
}
