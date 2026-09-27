import { Module } from '@nestjs/common';
import { UsageAggregationService } from './usage-aggregation.service';
import { UsageEstimateService } from './usage-estimate.service';
import { RoyaltyRateService } from './royalty-rate.service';
import { RoyaltyPoolService } from './royalty-pool.service';
import { RoyaltySettlementService } from './royalty-settlement.service';
import { RoyaltyRecoveryService } from './royalty-recovery.service';
import { TokenomicsModule } from '../../tokenomics/tokenomics.module';

/**
 * Revenue sharing: usage accounting, pool computation, settlement and recovery.
 *
 * No longer a leaf: settlement imports TokenomicsModule for the mintingPaused
 * kill switch. That is the one edge it has beyond the global PrismaService and
 * SettingsModule, and it is deliberately the only one -- money-moving code is
 * easier to reason about the fewer modules it can reach.
 *
 * Registered in AppModule rather than inside VoiceStreamModule: the aggregator
 * and the pool computer both run from standalone CronJob entrypoints that
 * resolve them from an application context, and VoiceStreamModule only composes
 * request-serving children. None of these services has an HTTP surface yet.
 */
@Module({
  // TokenomicsModule for the mintingPaused kill switch that settlement honours.
  // A plain leaf-to-leaf import: TokenomicsModule exports its service and
  // imports nothing from here, so no cycle.
  imports: [TokenomicsModule],
  providers: [
    UsageAggregationService,
    UsageEstimateService,
    RoyaltyRateService,
    RoyaltyPoolService,
    RoyaltySettlementService,
    RoyaltyRecoveryService,
  ],
  exports: [
    UsageAggregationService,
    UsageEstimateService,
    RoyaltyRateService,
    RoyaltyPoolService,
    RoyaltySettlementService,
    RoyaltyRecoveryService,
  ],
})
export class RevenueModule {}
