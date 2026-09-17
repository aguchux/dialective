import { Injectable, Logger } from '@nestjs/common';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { PrismaService } from './prisma/prisma.service';

// Yesterday through today (GA4's "today" bucket is still accumulating and
// gets revised repeatedly through the day -- ingesting it anyway, upserted
// by date, is harmless and means the dashboard isn't a full day stale) --
// see AnalyticsDailySnapshot's schema doc comment for why upsert-by-date
// absorbs GA4's own multi-day revision window.
const LOOKBACK_DAYS = 2;

const BREAKDOWN_DIMENSIONS: { name: string; gaDimension: string; limit: number }[] = [
  { name: 'page', gaDimension: 'pagePath', limit: 20 },
  { name: 'country', gaDimension: 'country', limit: 20 },
  { name: 'deviceCategory', gaDimension: 'deviceCategory', limit: 10 },
];

/**
 * One-shot job (mirrors fx-rate-job's application-context template):
 * pulls the last LOOKBACK_DAYS of GA4 metrics via the Data API and
 * upserts them into AnalyticsDailySnapshot/AnalyticsDailyBreakdown, so the
 * admin "Analytics & Metrics" report reads from our own DB rather than
 * calling Google's API (rate-limited, and subject to GA4's own multi-hour
 * processing latency) on every admin page view.
 *
 * Both env vars are required; missing either is treated as "not yet
 * configured" (logs and exits 0, not an error) rather than a hard failure
 * -- this job can be deployed and scheduled before an admin has finished
 * setting up the GCP service account, without every run showing as failed
 * in kubectl get cronjobs.
 */
@Injectable()
export class GoogleAnalyticsService {
  private readonly logger = new Logger(GoogleAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<void> {
    const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    const credentialsJson = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON;
    // The k8s secret's provisioning placeholder is the literal string
    // "changeme" -- treated the same as unset, not a value to attempt
    // parsing as JSON. Without this, a not-yet-replaced placeholder crashes
    // every 6-hour run forever (JSON.parse("changeme") throws) instead of
    // the intended graceful skip below.
    if (
      !propertyId ||
      !credentialsJson ||
      propertyId === 'changeme' ||
      credentialsJson === 'changeme'
    ) {
      this.logger.log(
        'GOOGLE_ANALYTICS_PROPERTY_ID/GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON not set -- skipping (not yet configured)',
      );
      return;
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
    } catch (err) {
      // Same reasoning as the placeholder check above -- a malformed
      // credentials value is a configuration problem to log and skip, not
      // a reason to crash-loop this job every 6 hours.
      this.logger.error(
        `GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON is not valid JSON -- skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const client = new BetaAnalyticsDataClient({ credentials });
    const property = `properties/${propertyId}`;

    await this.ingestDailySnapshot(client, property);
    await this.ingestBreakdowns(client, property);
  }

  private async ingestDailySnapshot(
    client: BetaAnalyticsDataClient,
    property: string,
  ): Promise<void> {
    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate: `${LOOKBACK_DAYS}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
        { name: 'conversions' },
      ],
    });

    for (const row of response.rows ?? []) {
      const rawDate = row.dimensionValues?.[0]?.value; // "YYYYMMDD"
      if (!rawDate || rawDate.length !== 8) continue;
      const date = new Date(
        `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00.000Z`,
      );
      const metrics = row.metricValues ?? [];
      const num = (i: number) => Number(metrics[i]?.value ?? 0) || 0;

      await this.prisma.analyticsDailySnapshot.upsert({
        where: { date },
        create: {
          date,
          activeUsers: num(0),
          newUsers: num(1),
          sessions: num(2),
          screenPageViews: num(3),
          averageSessionSeconds: num(4),
          engagementRate: num(5),
          conversions: num(6),
        },
        update: {
          activeUsers: num(0),
          newUsers: num(1),
          sessions: num(2),
          screenPageViews: num(3),
          averageSessionSeconds: num(4),
          engagementRate: num(5),
          conversions: num(6),
          fetchedAt: new Date(),
        },
      });
    }
    this.logger.log(`Ingested ${response.rows?.length ?? 0} daily snapshot row(s)`);
  }

  private async ingestBreakdowns(client: BetaAnalyticsDataClient, property: string): Promise<void> {
    for (const { name, gaDimension, limit } of BREAKDOWN_DIMENSIONS) {
      const [response] = await client.runReport({
        property,
        dateRanges: [{ startDate: `${LOOKBACK_DAYS}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'date' }, { name: gaDimension }],
        metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit,
      });

      let written = 0;
      for (const row of response.rows ?? []) {
        const rawDate = row.dimensionValues?.[0]?.value;
        const dimensionValue = row.dimensionValues?.[1]?.value;
        if (!rawDate || rawDate.length !== 8 || !dimensionValue) continue;
        const date = new Date(
          `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00.000Z`,
        );
        const metrics = row.metricValues ?? [];
        const num = (i: number) => Number(metrics[i]?.value ?? 0) || 0;

        await this.prisma.analyticsDailyBreakdown.upsert({
          where: { date_dimension_dimensionValue: { date, dimension: name, dimensionValue } },
          create: {
            date,
            dimension: name,
            dimensionValue,
            activeUsers: num(0),
            screenPageViews: num(1),
          },
          update: {
            activeUsers: num(0),
            screenPageViews: num(1),
            fetchedAt: new Date(),
          },
        });
        written++;
      }
      this.logger.log(`Ingested ${written} "${name}" breakdown row(s)`);
    }
  }
}
