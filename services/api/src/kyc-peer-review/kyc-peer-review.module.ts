import { Module, forwardRef } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { KycEvidenceRedactionService } from '../kyc/kyc-evidence-redaction.service';
import { KycModule } from '../kyc/kyc.module';
import { KycPeerReviewController } from './kyc-peer-review.controller';
import { KycPeerReviewService } from './kyc-peer-review.service';

/**
 * Community review of identity documents, as an Integration.
 *
 * KycEvidenceRedactionService is provided here rather than imported from
 * KycModule, which does not export it. It is stateless (a lazily-required
 * `canvas` wrapper), so a second instance costs nothing and avoids
 * widening KycModule's public surface for one consumer.
 */
@Module({
  // forwardRef on KycModule: it imports this module to pay reviewers on
  // admin approval, and a certified reviewer's verdict needs KycService.
  imports: [StorageModule, IntegrationsModule, forwardRef(() => KycModule)],
  controllers: [KycPeerReviewController],
  providers: [KycPeerReviewService, KycEvidenceRedactionService],
  exports: [KycPeerReviewService],
})
export class KycPeerReviewModule {}
