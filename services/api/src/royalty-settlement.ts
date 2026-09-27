import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RoyaltySettlementService } from './voice-stream/revenue/royalty-settlement.service';
import { RoyaltyRecoveryService } from './voice-stream/revenue/royalty-recovery.service';
import { periodStartOf } from './voice-stream/revenue/usage-aggregation.service';

/**
 * One-shot entrypoint for the royalty-settlement k8s CronJob.
 *
 * THIS MOVES MONEY. It credits `Wallet.royaltyBalance` and records revenue as a
 * reserve inflow. Three switches stand in front of it and all three are checked
 * before anything moves: `royaltiesEnabled` (false in production),
 * `royaltyShadowMode` (true in production) and
 * `TokenomicsPolicy.mintingPaused`. With the shipped defaults this job connects,
 * reports that shadow mode is on, and exits having changed nothing.
 *
 * Recovery runs FIRST, deliberately. A payment reversed since the last run must
 * be clawed back before new pools settle, so a contributor whose royalty was
 * charged back cannot withdraw it in the window between the two steps. Recovery
 * has no shadow-mode gate of its own: it only ever reverses pools that were
 * already settled, so if nothing was settled it finds nothing to reverse.
 *
 * Settles the PREVIOUS month by default, matching the aggregation and pool jobs.
 * Pass a YYYY-MM argument to settle a specific month; a pool is settled at most
 * once, so re-running is safe.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const settlement = app.get(RoyaltySettlementService);
  const recovery = app.get(RoyaltyRecoveryService);

  try {
    const arg = process.argv[2];
    // YYYY-MM, anchored mid-month so no timezone shift can move it into a
    // neighbouring period.
    const at = arg ? new Date(`${arg}-15T00:00:00.000Z`) : previousMonthAnchor();
    if (arg && Number.isNaN(at.getTime())) {
      throw new Error(`Invalid period argument "${arg}" -- expected YYYY-MM`);
    }
    const periodStart = periodStartOf(at);

    const recovered = await recovery.recoverReversedPayments();
    // eslint-disable-next-line no-console
    console.log('royalty recovery complete', {
      poolsReversed: recovered.poolsReversed,
      recoveredDl: recovered.recoveredDl,
      shortfallDl: recovered.shortfallDl,
      contributorsAffected: recovered.contributorsAffected,
    });

    const result = await settlement.settlePeriod(periodStart);
    // eslint-disable-next-line no-console
    console.log('royalty settlement complete', {
      periodStart: result.periodStart.toISOString().slice(0, 10),
      poolsSettled: result.poolsSettled,
      contributorsCredited: result.contributorsCredited,
      totalAccruedDl: result.totalAccruedDl,
      alreadySettled: result.alreadySettled,
      abortedBecause: result.abortedBecause ?? null,
    });
    await app.close();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('royalty settlement failed', err);
    await app.close();
    process.exit(1);
  }
}

/** An instant inside the previous month. Same convention as the other jobs. */
function previousMonthAnchor(now = new Date()): Date {
  const thisMonth = periodStartOf(now);
  return new Date(thisMonth.getTime() - 24 * 60 * 60 * 1000);
}

void bootstrap();
