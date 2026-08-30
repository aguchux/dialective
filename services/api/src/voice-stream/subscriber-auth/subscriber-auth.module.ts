import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { SubscriberAuthController } from './subscriber-auth.controller';
import { SubscriberAuthService } from './subscriber-auth.service';

@Module({
  imports: [MailModule],
  controllers: [SubscriberAuthController],
  providers: [SubscriberAuthService],
})
export class SubscriberAuthModule {}
