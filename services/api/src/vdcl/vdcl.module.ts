import { Module } from '@nestjs/common';
import { RightsService } from './rights/rights.service';

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
  providers: [RightsService],
  exports: [RightsService],
})
export class VdclModule {}
