import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AnomalyDetectionService } from './anomaly-detection.service';

@Module({
  imports: [MailModule, WebhooksModule],
  providers: [AnomalyDetectionService],
})
export class AnomalyDetectionModule {}
