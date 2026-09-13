import { Module } from '@nestjs/common';
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

@Module({
  imports: [StorageModule, LlmModule, MailModule, SmsModule],
  controllers: [KycController],
  providers: [
    KycService,
    DiditService,
    SelfHostedKycService,
    FaceMatchService,
    KycEvidenceRedactionService,
  ],
})
export class KycModule {}
