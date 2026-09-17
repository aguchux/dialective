const mockRunReport = jest.fn();

jest.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: jest.fn().mockImplementation(() => ({
    runReport: mockRunReport,
  })),
}));

import { GoogleAnalyticsService } from './google-analytics.service';

function row(date: string, dimensionValue: string | null, metrics: string[]) {
  return {
    dimensionValues: dimensionValue !== null ? [{ value: date }, { value: dimensionValue }] : [{ value: date }],
    metricValues: metrics.map((value) => ({ value })),
  };
}

describe('GoogleAnalyticsService.run', () => {
  let prisma: any;
  let service: GoogleAnalyticsService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    prisma = {
      analyticsDailySnapshot: { upsert: jest.fn().mockResolvedValue({}) },
      analyticsDailyBreakdown: { upsert: jest.fn().mockResolvedValue({}) },
    };
    service = new GoogleAnalyticsService(prisma as never);
    mockRunReport.mockReset();
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID = '123456789';
    process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'test@example.iam.gserviceaccount.com',
      private_key: 'fake-key',
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does nothing (no error) when the property id / credentials env vars are not set', async () => {
    delete process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    delete process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON;

    await expect(service.run()).resolves.toBeUndefined();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('does nothing (no error) when either env var is still the provisioning placeholder "changeme"', async () => {
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID = 'changeme';

    await expect(service.run()).resolves.toBeUndefined();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('does nothing (no error) when the credentials JSON is still the placeholder "changeme"', async () => {
    process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON = 'changeme';

    await expect(service.run()).resolves.toBeUndefined();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('logs and returns instead of throwing when the credentials JSON is malformed (but not the placeholder)', async () => {
    process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON = '{not valid json';

    await expect(service.run()).resolves.toBeUndefined();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('upserts a daily snapshot row per date returned by the site-wide report', async () => {
    mockRunReport
      .mockResolvedValueOnce([
        { rows: [row('20260915', null, ['120', '40', '90', '300', '85.5', '0.6234', '5'])] },
      ])
      .mockResolvedValue([{ rows: [] }]);

    await service.run();

    expect(prisma.analyticsDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { date: new Date('2026-09-15T00:00:00.000Z') },
        create: expect.objectContaining({
          activeUsers: 120,
          newUsers: 40,
          sessions: 90,
          screenPageViews: 300,
          averageSessionSeconds: 85.5,
          engagementRate: 0.6234,
          conversions: 5,
        }),
      }),
    );
  });

  it('upserts breakdown rows for each configured dimension (page, country, deviceCategory)', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }]) // daily snapshot
      .mockResolvedValueOnce([{ rows: [row('20260915', '/dashboard', ['50', '80'])] }]) // page
      .mockResolvedValueOnce([{ rows: [row('20260915', 'NG', ['30', '60'])] }]) // country
      .mockResolvedValueOnce([{ rows: [row('20260915', 'mobile', ['70', '150'])] }]); // deviceCategory

    await service.run();

    expect(prisma.analyticsDailyBreakdown.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date_dimension_dimensionValue: {
            date: new Date('2026-09-15T00:00:00.000Z'),
            dimension: 'page',
            dimensionValue: '/dashboard',
          },
        },
        create: expect.objectContaining({ activeUsers: 50, screenPageViews: 80 }),
      }),
    );
    expect(prisma.analyticsDailyBreakdown.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date_dimension_dimensionValue: {
            date: new Date('2026-09-15T00:00:00.000Z'),
            dimension: 'country',
            dimensionValue: 'NG',
          },
        },
      }),
    );
    expect(prisma.analyticsDailyBreakdown.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date_dimension_dimensionValue: {
            date: new Date('2026-09-15T00:00:00.000Z'),
            dimension: 'deviceCategory',
            dimensionValue: 'mobile',
          },
        },
      }),
    );
  });

  it('skips a row with a malformed or missing date rather than throwing', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [row('bad', null, ['1', '1', '1', '1', '1', '0.5', '0'])] }])
      .mockResolvedValue([{ rows: [] }]);

    await expect(service.run()).resolves.toBeUndefined();
    expect(prisma.analyticsDailySnapshot.upsert).not.toHaveBeenCalled();
  });
});
