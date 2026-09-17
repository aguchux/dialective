import { Injectable, Logger } from '@nestjs/common';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const REALTIME_TOP_N = 10;

/**
 * Calls GA4's Data API runRealtimeReport directly (unlike
 * AnalyticsReportService, which only ever reads the daily-batch snapshot
 * table google-analytics-job writes) -- "live" genuinely means asking
 * Google right now, so this is the one place in `api` that talks to the GA
 * Data API itself. Reads the same GOOGLE_ANALYTICS_PROPERTY_ID/
 * GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON env vars the job uses, read inside
 * getSnapshot() (not module-level) so they're picked up even if set after
 * this service is constructed -- same reasoning as
 * GoogleAnalyticsService.run() in services/google-analytics-job. Missing
 * either is "not configured" (configured: false), never a thrown error --
 * an admin opening this panel before GA credentials exist shouldn't see a
 * 500.
 */
@Injectable()
export class AnalyticsRealtimeService {
  private readonly logger = new Logger(AnalyticsRealtimeService.name);

  async getSnapshot() {
    const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    const credentialsJson = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON;
    if (!propertyId || !credentialsJson) {
      return { configured: false as const };
    }

    const client = new BetaAnalyticsDataClient({
      credentials: JSON.parse(credentialsJson) as Record<string, unknown>,
    });
    const property = `properties/${propertyId}`;

    try {
      const [totalsResponse, pagesResponse, countriesResponse] = await Promise.all([
        client.runRealtimeReport({ property, metrics: [{ name: 'activeUsers' }] }),
        client.runRealtimeReport({
          property,
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: REALTIME_TOP_N,
        }),
        client.runRealtimeReport({
          property,
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: REALTIME_TOP_N,
        }),
      ]);

      const activeUsers = Number(totalsResponse[0].rows?.[0]?.metricValues?.[0]?.value ?? '0');
      return {
        configured: true as const,
        fetchedAt: new Date().toISOString(),
        activeUsers,
        topPages: extractRows(pagesResponse[0].rows),
        topCountries: extractRows(countriesResponse[0].rows),
      };
    } catch (err) {
      this.logger.warn(`GA4 realtime report failed: ${String(err)}`);
      return { configured: true as const, error: 'Could not reach Google Analytics right now' };
    }
  }
}

function extractRows(
  rows:
    | {
        dimensionValues?: { value?: string | null }[] | null;
        metricValues?: { value?: string | null }[] | null;
      }[]
    | null
    | undefined,
) {
  return (rows ?? []).map((row) => ({
    value: row.dimensionValues?.[0]?.value ?? '(not set)',
    activeUsers: Number(row.metricValues?.[0]?.value ?? '0'),
  }));
}
