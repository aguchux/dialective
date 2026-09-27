import { Module } from '@nestjs/common';
import { UsageAggregationService } from './usage-aggregation.service';
import { UsageEstimateService } from './usage-estimate.service';
import { RoyaltyRateService } from './royalty-rate.service';
import { RoyaltyPoolService } from './royalty-pool.service';

/**
 * Revenue sharing: usage accounting and shadow-mode pool computation.
 *
 * Still a leaf module -- it depends on PrismaService and SettingsModule, both
 * global, and nothing else. That is worth keeping: the settlement work that
 * lands in Phase 6 touches TokenomicsService and the wallet ledger, and a
 * module that has stayed a leaf is far easier to reason about when money starts
 * moving through it.
 *
 * Registered in AppModule rather than inside VoiceStreamModule: the aggregator
 * and the pool computer both run from standalone CronJob entrypoints that
 * resolve them from an application context, and VoiceStreamModule only composes
 * request-serving children. None of these services has an HTTP surface yet.
 */
@Module({
  providers: [
    UsageAggregationService,
    UsageEstimateService,
    RoyaltyRateService,
    RoyaltyPoolService,
  ],
  exports: [
    UsageAggregationService,
    UsageEstimateService,
    RoyaltyRateService,
    RoyaltyPoolService,
  ],
})
export class RevenueModule {}
