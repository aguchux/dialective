import { SubscriberAnalyticsService } from './subscriber-analytics.service';

function setup() {
  const prisma = {
    streamAccessLog: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new SubscriberAnalyticsService(prisma as any);
  return { prisma, service };
}

describe('SubscriberAnalyticsService.build', () => {
  it('returns an empty-state report for an org with no access logs', async () => {
    const { service } = setup();

    const report = await service.build('org-1');

    expect(report.totalRequests).toBe(0);
    expect(report.audioRequests).toBe(0);
    expect(report.totalBytesStreamed).toBe('0');
    expect(report.totalHoursStreamed).toBe(0);
    expect(report.deniedRequestRate).toBe(0);
    expect(report.successRate).toBe(1);
    expect(report.rows).toEqual([]);
  });

  it('computes denial rate from non-allowed entitlementDecision rows', async () => {
    const { prisma, service } = setup();
    prisma.streamAccessLog.count.mockResolvedValue(10);
    prisma.streamAccessLog.groupBy.mockImplementation(({ by }: { by: string[] }) => {
      if (by[0] === 'entitlementDecision') {
        return Promise.resolve([
          { entitlementDecision: 'allowed', _count: { _all: 8 } },
          { entitlementDecision: 'denied:tier_gated', _count: { _all: 2 } },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await service.build('org-1');

    expect(report.deniedRequestRate).toBe(0.2);
    expect(report.successRate).toBe(0.8);
  });

  it('sums bytesStreamed across audio rows and scopes the where clause by date range', async () => {
    const { prisma, service } = setup();
    prisma.streamAccessLog.findMany.mockResolvedValue([
      {
        bytesStreamed: BigInt(1000),
        durationStreamedMs: 1_800_000,
        createdAt: new Date(),
        deckId: 'deck-1',
        recordingId: 'rec-1',
        resultCode: 200,
        entitlementDecision: 'allowed',
      },
      {
        bytesStreamed: BigInt(2000),
        durationStreamedMs: 1_800_000,
        createdAt: new Date(),
        deckId: 'deck-1',
        recordingId: 'rec-2',
        resultCode: 200,
        entitlementDecision: 'allowed',
      },
    ]);

    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    const report = await service.build('org-1', from, to);

    expect(report.totalBytesStreamed).toBe('3000');
    expect(report.totalHoursStreamed).toBe(1);
    expect(report.audioRequests).toBe(2);
    expect(prisma.streamAccessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          createdAt: { gte: from, lte: to },
        }),
      }),
    );
  });
});

describe('SubscriberAnalyticsService.buildTimeSeries', () => {
  it('returns one zero-filled bucket per day in range when there are no logs', async () => {
    const { service } = setup();

    const points = await service.buildTimeSeries(
      'org-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-03T00:00:00Z'),
    );

    expect(points).toEqual([
      { date: '2026-01-01', successfulRequests: 0, failedRequests: 0 },
      { date: '2026-01-02', successfulRequests: 0, failedRequests: 0 },
      { date: '2026-01-03', successfulRequests: 0, failedRequests: 0 },
    ]);
  });

  it('buckets rows by UTC day and splits allowed vs denied', async () => {
    const { prisma, service } = setup();
    prisma.streamAccessLog.findMany.mockResolvedValue([
      { createdAt: new Date('2026-01-01T10:00:00Z'), entitlementDecision: 'allowed' },
      { createdAt: new Date('2026-01-01T12:00:00Z'), entitlementDecision: 'denied:tier_gated' },
      { createdAt: new Date('2026-01-02T01:00:00Z'), entitlementDecision: 'allowed' },
    ]);

    const points = await service.buildTimeSeries(
      'org-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(points).toEqual([
      { date: '2026-01-01', successfulRequests: 1, failedRequests: 1 },
      { date: '2026-01-02', successfulRequests: 1, failedRequests: 0 },
    ]);
  });
});
