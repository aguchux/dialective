import { Module } from '@nestjs/common';
import { WebhooksModule } from '../voice-stream/webhooks/webhooks.module';
import { RightsService } from './rights/rights.service';
import { DeckCoverageService } from './rights/deck-coverage.service';
import { CoverageNotifierService } from './rights/coverage-notifier.service';

/**
 * Voice Dataset Contributor Licence (VDCL).
 *
 * Phase 0 ships the rights check alone -- the one question the whole product
 * reduces to: may recording X be used for purpose Y? The maker, compilation
 * pipeline, documents and verification views (Phases 2-4) layer on top and
 * will arrive as sibling sub-modules here, mirroring voice-stream/'s shape.
 *
 * Deliberately NOT a new service. Compilation will run as a queue-driven job
 * inside the api image, the same shape as reserve-balance-poll and
 * tokenomics-valuation.
 */
@Module({
  imports: [WebhooksModule],
  providers: [RightsService, DeckCoverageService, CoverageNotifierService],
  exports: [RightsService, DeckCoverageService, CoverageNotifierService],
})
export class VdclModule {}
