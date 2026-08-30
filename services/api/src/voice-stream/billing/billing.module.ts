import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RequireActiveSubscriptionGuard } from './require-active-subscription.guard';

@Module({
  controllers: [BillingController],
  providers: [BillingService, RequireActiveSubscriptionGuard],
  exports: [RequireActiveSubscriptionGuard],
})
export class BillingModule {}
