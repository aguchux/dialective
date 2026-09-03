import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AdminSmsController } from './admin-sms.controller';
import { AdminSmsService } from './admin-sms.service';
import { SmsService } from './sms.service';

@Module({
  imports: [SettingsModule],
  controllers: [AdminSmsController],
  providers: [SmsService, AdminSmsService],
  exports: [SmsService],
})
export class SmsModule {}
