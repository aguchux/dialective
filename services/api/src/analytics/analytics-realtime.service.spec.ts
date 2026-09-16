const mockRunRealtimeReport = jest.fn();

jest.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: jest.fn().mockImplementation(() => ({
    runRealtimeReport: mockRunRealtimeReport,
  })),
}));

import { AnalyticsRealtimeService } from './analytics-realtime.service';

const originalEnv = { ...process.env };

describe('AnalyticsRealtimeService.getSnapshot', () => {
  let service: AnalyticsRealtimeService;

  beforeEach(() => {
    service = new AnalyticsRealtimeService();
    mockRunRealtimeReport.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports configured=false when GA credentials are not set', async () => {
    delete process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    delete process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON;

    const result = await service.getSnapshot();

    expect(result).toEqual({ configured: false });
    expect(mockRunRealtimeReport).not.toHaveBeenCalled();
  });

  it('returns active users and top pages/countries when configured', async () => {
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID = '123456789';
    process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'test@example.iam.gserviceaccount.com',
      private_key: 'fake-key',
    });
    mockRunRealtimeReport
      .mockResolvedValueOnce([{ rows: [{ metricValues: [{ value: '42' }] }] }])
      .mockResolvedValueOnce([
        {
          rows: [
            { dimensionValues: [{ value: '/dashboard' }], metricValues: [{ value: '10' }] },
            { dimensionValues: [{ value: '/learn' }], metricValues: [{ value: '5' }] },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          rows: [{ dimensionValues: [{ value: 'Nigeria' }], metricValues: [{ value: '20' }] }],
        },
      ]);

    const result = await service.getSnapshot();

    expect(result.configured).toBe(true);
    expect(result).toMatchObject({
      activeUsers: 42,
      topPages: [
        { value: '/dashboard', activeUsers: 10 },
        { value: '/learn', activeUsers: 5 },
      ],
      topCountries: [{ value: 'Nigeria', activeUsers: 20 }],
    });
  });

  it('returns configured=true with an error message when the GA4 call fails, never throws', async () => {
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID = '123456789';
    process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'test@example.iam.gserviceaccount.com',
      private_key: 'fake-key',
    });
    mockRunRealtimeReport.mockRejectedValue(new Error('permission denied'));

    const result = await service.getSnapshot();

    expect(result.configured).toBe(true);
    expect(result.error).toBeTruthy();
  });
});
