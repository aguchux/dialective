import { Module } from '@nestjs/common';
import { SubscriberAuthModule } from '../voice-stream/subscriber-auth/subscriber-auth.module';
import { MailModule } from '../mail/mail.module';
import { StorageModule } from '../storage/storage.module';
import { SmsModule } from '../sms/sms.module';
import { LeadsController } from './leads.controller';

@Module({
  imports: [SubscriberAuthModule, MailModule, StorageModule, SmsModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
