import { Module } from '@nestjs/common';
import { UsageAggregationService } from './usage-aggregation.service';
import { UsageEstimateService } from './usage-estimate.service';

/**
 * Revenue sharing: usage accounting only, at this phase.
 *
 * A leaf module -- it depends on PrismaService (global) and nothing else. That
 * is worth keeping: the pool and accrual work that lands here later touches
 * TokenomicsService and the wallet ledger, and a module that has stayed a leaf
 * is far easier to reason about when money starts moving through it.
 *
 * Registered in AppModule rather than inside VoiceStreamModule: the aggregator
 * runs from a standalone CronJob entrypoint that resolves it from an
 * application context, and VoiceStreamModule only composes request-serving
 * children. Neither service has an HTTP surface yet.
 */
@Module({
  providers: [UsageAggregationService, UsageEstimateService],
  exports: [UsageAggregationService, UsageEstimateService],
})
export class RevenueModule {}
