import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AdminSmsController } from './admin-sms.controller';
import { AdminSmsService } from './admin-sms.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [SettingsModule],
  controllers: [AdminSmsController],
  providers: [SmsService, AdminSmsService, WhatsappService],
  exports: [SmsService, WhatsappService],
})
export class SmsModule {}
