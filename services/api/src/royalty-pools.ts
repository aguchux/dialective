import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsageAggregationService } from './voice-stream/revenue/usage-aggregation.service';
import { RoyaltyPoolService } from './voice-stream/revenue/royalty-pool.service';
import { RoyaltyRateService } from './voice-stream/revenue/royalty-rate.service';
import { PlatformSettingsService } from './settings/platform-settings.service';

/**
 * One-shot entrypoint for the royalty-pools k8s CronJob.
 *
 * SHADOW MODE. Every pool this writes carries `settledAt: null` -- computed,
 * frozen, allocated to the cent, and paying nobody. Nothing is minted, no
 * balance is credited, and no ledger row is written. Phase 6 is what attaches
 * money, and docs/Stream-Revenue-Sharing-Engine.md section 7 requires this to
 * have run for at least one full period of real traffic first.
 *
 * It re-aggregates the period before computing pools, in that order and in one
 * process. A pool divides exactly the figures RecordingUsagePeriod holds, so
 * pooling against a period that was never aggregated -- or was aggregated
 * before the last of its access-log rows landed -- would split a fraction of
 * the real usage and misprice every share in it. Aggregation is idempotent
 * (recompute-and-replace), so doing it again here costs a re-read and removes
 * an ordering assumption between two CronJobs.
 *
 * Handles the PREVIOUS month by default. Pass a YYYY-MM argument to recompute a
 * specific month; pools already written are left exactly as they are, because
 * RoyaltyPool.paymentId is unique and a frozen pool must never be repriced.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const aggregation = app.get(UsageAggregationService);
  const pools = app.get(RoyaltyPoolService);
  const rates = app.get(RoyaltyRateService);
  const settings = app.get(PlatformSettingsService);

  try {
    // Seed the baseline rate if the schedule is empty, so the first period has
    // a rate to settle at. Idempotent -- an existing schedule is never touched,
    // because moving a rate a pool may already have used would reprice it.
    // Done here rather than in the seed because this is the only process that
    // needs a rate, and it needs one immediately before computing.
    await rates.ensureBaseline(await settings.getRoyaltySharePercent());

    const arg = process.argv[2];
    // YYYY-MM, anchored mid-month so no timezone shift can move it into a
    // neighbouring period.
    const at = arg ? new Date(`${arg}-15T00:00:00.000Z`) : undefined;
    if (arg && Number.isNaN(at?.getTime())) {
      throw new Error(`Invalid period argument "${arg}" -- expected YYYY-MM`);
    }

    const aggregated = await aggregation.aggregatePeriod(at);
    // eslint-disable-next-line no-console
    console.log('usage re-aggregated before pooling', {
      periodStart: aggregated.periodStart.toISOString().slice(0, 10),
      rowsWritten: aggregated.rowsWritten,
      unattributable: aggregated.unattributable,
    });

    const result = await pools.computePeriod(at);
    // eslint-disable-next-line no-console
    console.log('royalty pool computation complete', {
      periodStart: result.periodStart.toISOString().slice(0, 10),
      poolsWritten: result.poolsWritten,
      accrualsWritten: result.accrualsWritten,
      skipped: result.skipped,
      shadowMode: result.shadowMode,
    });
    await app.close();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('royalty pool computation failed', err);
    await app.close();
    process.exit(1);
  }
}

void bootstrap();
