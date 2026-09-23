import { Module } from '@nestjs/common';
import { WebhooksModule } from '../voice-stream/webhooks/webhooks.module';
import { OtpModule } from '../otp/otp.module';
import { RightsService } from './rights/rights.service';
import { DeckCoverageService } from './rights/deck-coverage.service';
import { CoverageNotifierService } from './rights/coverage-notifier.service';
import { VdclAdminController } from './admin/vdcl-admin.controller';
import { VdclAdminService } from './admin/vdcl-admin.service';
import { VdclCompilationController } from './compilation/vdcl-compilation.controller';
import { VdclCompilationService } from './compilation/vdcl-compilation.service';
import { VdclDraftService } from './compilation/vdcl-draft.service';
import { ManifestInspectorService } from './compilation/manifest-inspector.service';
import { VdclMakerController } from './maker/vdcl-maker.controller';
import { VdclMakerService } from './maker/vdcl-maker.service';
import { VdclReadinessService } from './maker/readiness.service';
import { VdclSigningService } from './maker/vdcl-signing.service';
import { CompilationTrackerService } from './maker/compilation-tracker.service';
import { VdclDocumentsService } from './documents/vdcl-documents.service';
import { VdclVerificationService } from './documents/verification.service';
import { VdclVerificationController } from './documents/verification.controller';
import { StorageModule } from '../storage/storage.module';
import { VdclEnabledGuard } from './vdcl-enabled.guard';

/**
 * Voice Dataset Contributor Licence (VDCL).
 *
 * Phase 0 shipped rights/ -- the one question the whole product reduces
 * to: may recording X be used for purpose Y? compilation/ (Phase 2)
 * produces the manifests that question is answered against, maker/
 * (Phase 3) is how a contributor signs one, and documents/ (Phase 4)
 * issues the PDF, certificate and public QR verification.
 *
 * One boundary runs through all of it: documents/verification is the only
 * unauthenticated surface, and it is the most exposed point of the mutual
 * anonymity guarantee. It answers "is this licence real and in force?" and
 * deliberately never "whose licence is it?".
 *
 * Deliberately NOT a new service. Compilation runs inline today and the
 * job row exists to move it to a worker inside the api image later, the
 * same shape as reserve-balance-poll and tokenomics-valuation.
 */
@Module({
  imports: [WebhooksModule, OtpModule, StorageModule],
  controllers: [
    VdclAdminController,
    VdclCompilationController,
    VdclMakerController,
    VdclVerificationController,
  ],
  providers: [
    VdclEnabledGuard,
    RightsService,
    DeckCoverageService,
    CoverageNotifierService,
    VdclAdminService,
    VdclCompilationService,
    VdclDraftService,
    ManifestInspectorService,
    VdclMakerService,
    VdclReadinessService,
    VdclSigningService,
    CompilationTrackerService,
    VdclDocumentsService,
    VdclVerificationService,
  ],
  exports: [
    RightsService,
    DeckCoverageService,
    CoverageNotifierService,
    VdclCompilationService,
  ],
})
export class VdclModule {}
