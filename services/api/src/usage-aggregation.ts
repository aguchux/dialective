import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsageAggregationService } from './voice-stream/revenue/usage-aggregation.service';

/**
 * One-shot entrypoint for the usage-aggregation k8s CronJob.
 *
 * Rolls the stream access log into RecordingUsagePeriod rows -- the accounting
 * source contributor revenue sharing divides (see
 * docs/Stream-Revenue-Sharing-Engine.md section 3).
 *
 * Moves no money and reads no revenue. It is safe to run before any pool or
 * payout exists, and running it for a full period before money is attached is
 * exactly the point: with zero streaming history in production, a split rule
 * that has never been computed against real usage should not first be computed
 * with money on it.
 *
 * Aggregates the PREVIOUS month by default, so it runs after a period has
 * closed rather than mid-period. Pass a YYYY-MM argument to re-aggregate a
 * specific month; re-running is idempotent (the period is recomputed and
 * replaced, never incremented).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const aggregation = app.get(UsageAggregationService);

  try {
    const arg = process.argv[2];
    // YYYY-MM, anchored mid-month so no timezone shift can move it into a
    // neighbouring period.
    const at = arg ? new Date(`${arg}-15T00:00:00.000Z`) : undefined;
    if (arg && Number.isNaN(at?.getTime())) {
      throw new Error(`Invalid period argument "${arg}" -- expected YYYY-MM`);
    }

    const result = await aggregation.aggregatePeriod(at);
    // eslint-disable-next-line no-console
    console.log('usage aggregation complete', {
      periodStart: result.periodStart.toISOString().slice(0, 10),
      rowsWritten: result.rowsWritten,
      logRowsRead: result.logRowsRead,
      unattributable: result.unattributable,
    });
    await app.close();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('usage aggregation failed', err);
    await app.close();
    process.exit(1);
  }
}

void bootstrap();
