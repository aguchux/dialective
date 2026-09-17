import { Module } from '@nestjs/common';
import { ApiAccessTokensModule } from '../../api-access-tokens/api-access-tokens.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsageCounterModule } from '../stream-api/usage-counter.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RequireActiveSubscriptionGuard } from './require-active-subscription.guard';
import { TierGateGuard } from './tier-gate.guard';
import { SubscriptionPlansService } from './subscription-plans.service';
import {
  PublicSubscriptionPlansController,
  SubscriptionPlansController,
} from './subscription-plans.controller';

@Module({
  imports: [ApiAccessTokensModule, WebhooksModule, UsageCounterModule],
  controllers: [BillingController, SubscriptionPlansController, PublicSubscriptionPlansController],
  providers: [
    BillingService,
    RequireActiveSubscriptionGuard,
    TierGateGuard,
    SubscriptionPlansService,
  ],
  exports: [RequireActiveSubscriptionGuard, TierGateGuard],
})
export class BillingModule {}
