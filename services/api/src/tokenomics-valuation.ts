import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TokenomicsService } from './tokenomics/tokenomics.service';

/**
 * One-shot entrypoint for the tokenomics-valuation k8s CronJob. Runs the
 * scheduled valuation cycle (docs/Tokenomics-Reserve-Engine.md SS9/33).
 * Skips entirely if the engine is disabled (TokenomicsPolicy.enabled=false);
 * runs even when mintingPaused is true, since paused minting should not
 * blind admins to reserve coverage.
 *
 * NOTE: TokenomicsPolicy.valuationIntervalMinutes is NOT read by this
 * schedule -- k8s CronJob schedules are static cron expressions fixed at
 * deploy time. Changing valuationIntervalMinutes in the DB has no effect on
 * cadence; also update k8s/base/tokenomics-valuation-cronjob.yaml's
 * `schedule` and redeploy. The default there (daily) matches the policy's
 * own default of 1440 minutes.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const tokenomics = app.get(TokenomicsService);

  try {
    if (!(await tokenomics.isEnabled())) {
      // eslint-disable-next-line no-console
      console.log('tokenomics disabled; skipping valuation cycle');
      await app.close();
      process.exit(0);
    }
    const snapshot = await tokenomics.recalculateValuation();
    // eslint-disable-next-line no-console
    console.log('valuation snapshot created', {
      id: snapshot.id,
      publishedValueUsd: snapshot.publishedValueUsd.toString(),
    });
    await app.close();
    process.exit(0);
  } catch (err) {
    await app.close();
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

bootstrap();
