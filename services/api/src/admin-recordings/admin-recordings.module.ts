import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { OtpModule } from '../otp/otp.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminRecordingsController } from './admin-recordings.controller';
import { AdminRecordingsService } from './admin-recordings.service';

@Module({
  imports: [StorageModule, OtpModule, SettingsModule],
  controllers: [AdminRecordingsController],
  providers: [AdminRecordingsService],
})
export class AdminRecordingsModule {}
