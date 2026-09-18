import { Module, forwardRef } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { DiditService } from './didit.service';
import { SelfHostedKycService } from './self-hosted-kyc.service';
import { FaceMatchService } from './face-match.service';
import { KycEvidenceRedactionService } from './kyc-evidence-redaction.service';
import { StorageModule } from '../storage/storage.module';
import { LlmModule } from '../llm/llm.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { KycPeerReviewModule } from '../kyc-peer-review/kyc-peer-review.module';

@Module({
  // KycPeerReviewModule: the admin-approve route pays peer reviewers.
  imports: [
    StorageModule,
    LlmModule,
    MailModule,
    SmsModule,
    forwardRef(() => KycPeerReviewModule),
  ],
  controllers: [KycController],
  exports: [KycService],
  providers: [
    KycService,
    DiditService,
    SelfHostedKycService,
    FaceMatchService,
    KycEvidenceRedactionService,
  ],
})
export class KycModule {}
