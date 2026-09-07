import { Module } from '@nestjs/common';
import { SubscriberAuthModule } from '../voice-stream/subscriber-auth/subscriber-auth.module';
import { MailModule } from '../mail/mail.module';
import { LeadsController } from './leads.controller';

@Module({
  imports: [SubscriberAuthModule, MailModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
