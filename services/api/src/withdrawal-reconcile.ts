import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WithdrawalReconciliationService } from './wallet/withdrawal-reconciliation.service';

/**
 * One-shot entrypoint for the withdrawal-reconcile k8s CronJob -- polls
 * NOWPayments and Flutterwave for every PROCESSING withdrawal and updates
 * status (payout-automation plan point 9). Same "createApplicationContext,
 * run, exit" shape as settlement-job's main.ts, but lives in services/api
 * since it needs WalletModule's NowPaymentsService/FlutterwaveService/
 * PlatformSettingsService.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const reconciliation = app.get(WithdrawalReconciliationService);

  try {
    await reconciliation.run();
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
