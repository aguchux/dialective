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
    prisma.analyticsDailySnapshot.findFirst.mockResolvedValue({
      fetchedAt: new Date('2026-09-15T06:00:00Z'),
    });

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

  // Asserts the clamped day count and the exact UTC-midnight boundary it
  // produces, rather than re-deriving elapsed days from Date.now(). `since` is
  // (now - days) floored to UTC midnight, so the elapsed span is always the
  // clamped count PLUS however far into the current day we are -- rounding
  // that tips to 91 for any run after 12:00 UTC. The clamp was never wrong;
  // the measurement was.
  it.each([
    [500, 90],
    [0, 1],
    [-7, 1],
    [45, 45],
  ])('clamps a requested %i days to %i', async (requested, expectedDays) => {
    const { service, prisma } = setup();

    const result = await service.getSummary(requested);

    expect(result.days).toBe(expectedDays);

    const expectedSince = new Date();
    expectedSince.setUTCDate(expectedSince.getUTCDate() - expectedDays);
    expectedSince.setUTCHours(0, 0, 0, 0);

    const sinceUsed = prisma.analyticsDailySnapshot.findMany.mock.calls[0][0].where.date
      .gte as Date;
    expect(sinceUsed.toISOString()).toBe(expectedSince.toISOString());
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

  // getBreakdown carries its own copy of the same clamp, so it can drift from
  // getSummary's independently.
  it('clamps its window the same way getSummary does', async () => {
    const { service, prisma } = setup();

    await service.getBreakdown('page', 500);

    const expectedSince = new Date();
    expectedSince.setUTCDate(expectedSince.getUTCDate() - 90);
    expectedSince.setUTCHours(0, 0, 0, 0);

    const sinceUsed = prisma.analyticsDailyBreakdown.groupBy.mock.calls[0][0].where.date
      .gte as Date;
    expect(sinceUsed.toISOString()).toBe(expectedSince.toISOString());
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
