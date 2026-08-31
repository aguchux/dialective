import { Module } from '@nestjs/common';
import { UsageCounterService } from './usage-counter.service';

/**
 * Split out from StreamApiModule (which already imports BillingModule) so
 * BillingController can also inject UsageCounterService for the
 * dashboard-facing GET usage endpoint without a circular module import.
 */
@Module({
  providers: [UsageCounterService],
  exports: [UsageCounterService],
})
export class UsageCounterModule {}
