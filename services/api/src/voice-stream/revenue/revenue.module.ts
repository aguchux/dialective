import { Module } from '@nestjs/common';
import { UsageAggregationService } from './usage-aggregation.service';
import { UsageEstimateService } from './usage-estimate.service';
import { RoyaltyRateService } from './royalty-rate.service';
import { RoyaltyPoolService } from './royalty-pool.service';
import { RoyaltySettlementService } from './royalty-settlement.service';
import { RoyaltyRecoveryService } from './royalty-recovery.service';
import { TokenomicsModule } from '../../tokenomics/tokenomics.module';
import { OtpModule } from '../../otp/otp.module';
import { RoyaltyWithdrawalService } from './royalty-withdrawal.service';
import { RoyaltyWithdrawalController } from './royalty-withdrawal.controller';
import { RoyaltyAdminController } from './royalty-admin.controller';

/**
 * Revenue sharing: usage accounting, pool computation, settlement and recovery.
 *
 * No longer a leaf: settlement imports TokenomicsModule for the mintingPaused
 * kill switch, and the withdrawal controller imports OtpModule for the step-up.
 * Those are its only two edges beyond the global PrismaService and
 * SettingsModule -- money-moving code is easier to reason about the fewer
 * modules it can reach. Neither import reaches back into SettingsModule, so the
 * @Global sink invariant module-graph.spec.ts guards is untouched.
 *
 * Registered in AppModule rather than inside VoiceStreamModule: the aggregator,
 * the pool computer and the settlement job all run from standalone CronJob
 * entrypoints that resolve them from an application context, and
 * VoiceStreamModule only composes request-serving children. The royalty payout
 * routes are the module's first HTTP surface.
 */
@Module({
  // TokenomicsModule for the mintingPaused kill switch that settlement honours.
  // A plain leaf-to-leaf import: TokenomicsModule exports its service and
  // imports nothing from here, so no cycle.
  imports: [TokenomicsModule, OtpModule],
  controllers: [RoyaltyWithdrawalController, RoyaltyAdminController],
  providers: [
    UsageAggregationService,
    UsageEstimateService,
    RoyaltyRateService,
    RoyaltyPoolService,
    RoyaltySettlementService,
    RoyaltyRecoveryService,
    RoyaltyWithdrawalService,
  ],
  exports: [
    UsageAggregationService,
    UsageEstimateService,
    RoyaltyRateService,
    RoyaltyPoolService,
    RoyaltySettlementService,
    RoyaltyRecoveryService,
    RoyaltyWithdrawalService,
  ],
})
export class RevenueModule {}
