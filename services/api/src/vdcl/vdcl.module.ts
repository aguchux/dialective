import { Module } from '@nestjs/common';
import { WebhooksModule } from '../voice-stream/webhooks/webhooks.module';
import { RightsService } from './rights/rights.service';
import { DeckCoverageService } from './rights/deck-coverage.service';
import { CoverageNotifierService } from './rights/coverage-notifier.service';
import { VdclAdminController } from './admin/vdcl-admin.controller';
import { VdclAdminService } from './admin/vdcl-admin.service';
import { VdclCompilationController } from './compilation/vdcl-compilation.controller';
import { VdclCompilationService } from './compilation/vdcl-compilation.service';
import { VdclDraftService } from './compilation/vdcl-draft.service';
import { ManifestInspectorService } from './compilation/manifest-inspector.service';

/**
 * Voice Dataset Contributor Licence (VDCL).
 *
 * Phase 0 shipped the rights check -- the one question the whole product
 * reduces to: may recording X be used for purpose Y? Phase 2 adds
 * compilation/, which produces the manifests that question is answered
 * against. The maker UI, documents and verification views (Phases 3-4)
 * layer on top and will arrive as sibling sub-modules here, mirroring
 * voice-stream/'s shape.
 *
 * Deliberately NOT a new service. Compilation will run as a queue-driven job
 * inside the api image, the same shape as reserve-balance-poll and
 * tokenomics-valuation.
 */
@Module({
  imports: [WebhooksModule],
  controllers: [VdclAdminController, VdclCompilationController],
  providers: [
    RightsService,
    DeckCoverageService,
    CoverageNotifierService,
    VdclAdminService,
    VdclCompilationService,
    VdclDraftService,
    ManifestInspectorService,
  ],
  exports: [
    RightsService,
    DeckCoverageService,
    CoverageNotifierService,
    VdclCompilationService,
  ],
})
export class VdclModule {}
