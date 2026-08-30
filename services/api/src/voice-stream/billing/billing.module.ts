import { Module } from '@nestjs/common';
import { ApiAccessTokensModule } from '../../api-access-tokens/api-access-tokens.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RequireActiveSubscriptionGuard } from './require-active-subscription.guard';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionPlansController } from './subscription-plans.controller';

@Module({
  imports: [ApiAccessTokensModule],
  controllers: [BillingController, SubscriptionPlansController],
  providers: [BillingService, RequireActiveSubscriptionGuard, SubscriptionPlansService],
  exports: [RequireActiveSubscriptionGuard],
})
export class BillingModule {}
