import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SubscriberAuthController } from './subscriber-auth.controller';
import { SubscriberAuthService } from './subscriber-auth.service';

@Module({
  imports: [MailModule, WebhooksModule],
  controllers: [SubscriberAuthController],
  providers: [SubscriberAuthService],
})
export class SubscriberAuthModule {}
