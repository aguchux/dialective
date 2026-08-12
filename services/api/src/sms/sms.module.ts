import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SmsService } from './sms.service';

@Module({
  imports: [SettingsModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
