import { AnalyticsReportService } from './analytics-report.service';

function decimal(value: number) {
  return { toString: () => String(value) };
}

function setup() {
  const prisma: any = {
    analyticsDailySnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    analyticsDailyBreakdown: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new AnalyticsReportService(prisma);
  return { service, prisma };
}

describe('AnalyticsReportService.getSummary', () => {
  it('reports configured=false and no lastFetchedAt when no snapshot has ever been ingested', async () => {
    const { service } = setup();
    const result = await service.getSummary();
    expect(result).toMatchObject({ configured: false, lastFetchedAt: null });
  });

  it('sums per-day totals across the window and reports configured=true once a snapshot exists', async () => {
    const { service, prisma } = setup();
    prisma.analyticsDailySnapshot.findMany.mockResolvedValue([
      {
        date: new Date('2026-09-14'),
        activeUsers: 10,
        newUsers: 3,
        sessions: 8,
        screenPageViews: 40,
        averageSessionSeconds: decimal(90),
        engagementRate: decimal(0.5),
        conversions: 1,
      },
      {
        date: new Date('2026-09-15'),
        activeUsers: 20,
        newUsers: 5,
        sessions: 15,
        screenPageViews: 60,
        averageSessionSeconds: decimal(100),
        engagementRate: decimal(0.6),
        conversions: 2,
      },
    ]);
    prisma.analyticsDailySnapshot.findFirst.mockResolvedValue({ fetchedAt: new Date('2026-09-15T06:00:00Z') });

    const result = await service.getSummary();

    expect(result.configured).toBe(true);
    expect(result.totals).toEqual({
      activeUsers: 30,
      newUsers: 8,
      sessions: 23,
      screenPageViews: 100,
      conversions: 3,
    });
    expect(result.daily).toHaveLength(2);
  });

  it('clamps days to the 1-90 range', async () => {
    const { service, prisma } = setup();
    await service.getSummary(500);
    const call = prisma.analyticsDailySnapshot.findMany.mock.calls[0][0];
    const sinceUsed = call.where.date.gte as Date;
    const daysAgo = Math.round((Date.now() - sinceUsed.getTime()) / (24 * 60 * 60 * 1000));
    expect(daysAgo).toBeLessThanOrEqual(90);

    await service.getSummary(0);
    const call2 = prisma.analyticsDailySnapshot.findMany.mock.calls[1][0];
    const sinceUsed2 = call2.where.date.gte as Date;
    const daysAgo2 = Math.round((Date.now() - sinceUsed2.getTime()) / (24 * 60 * 60 * 1000));
    expect(daysAgo2).toBeGreaterThanOrEqual(1);
  });
});

describe('AnalyticsReportService.getBreakdown', () => {
  it('groups by dimensionValue, summed across the window, ordered by activeUsers desc', async () => {
    const { service, prisma } = setup();
    prisma.analyticsDailyBreakdown.groupBy.mockResolvedValue([
      { dimensionValue: '/dashboard', _sum: { activeUsers: 50, screenPageViews: 90 } },
    ]);

    const result = await service.getBreakdown('page');

    expect(prisma.analyticsDailyBreakdown.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['dimensionValue'],
        where: expect.objectContaining({ dimension: 'page' }),
        orderBy: { _sum: { activeUsers: 'desc' } },
        take: 10,
      }),
    );
    expect(result).toEqual([{ value: '/dashboard', activeUsers: 50, screenPageViews: 90 }]);
  });

  it('defaults missing sums to 0 rather than null', async () => {
    const { service, prisma } = setup();
    prisma.analyticsDailyBreakdown.groupBy.mockResolvedValue([
      { dimensionValue: 'NG', _sum: { activeUsers: null, screenPageViews: null } },
    ]);

    const result = await service.getBreakdown('country');
    expect(result).toEqual([{ value: 'NG', activeUsers: 0, screenPageViews: 0 }]);
  });
});
