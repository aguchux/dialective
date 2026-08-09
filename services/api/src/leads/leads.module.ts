import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { LeadsController } from './leads.controller';

@Module({
  imports: [MailModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
