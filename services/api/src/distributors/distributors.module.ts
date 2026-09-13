import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { SettingsModule } from '../settings/settings.module';
import { DistributorsController } from './distributors.controller';
import { DistributorsService } from './distributors.service';

@Module({
  imports: [OtpModule, SettingsModule],
  controllers: [DistributorsController],
  providers: [DistributorsService],
})
export class DistributorsModule {}
