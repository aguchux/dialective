import { Global, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { OtpModule } from '../otp/otp.module';
import { PlatformSettingsService } from './platform-settings.service';
import {
  PublicSettingsController,
  SettingsController,
  StreamPublicSettingsController,
} from './settings.controller';

// @Global so PlatformSettingsService is available for DI anywhere without
// every feature module importing SettingsModule -- needed because
// JwtAuthGuard (used via @UseGuards across ~12 controllers in modules that
// mostly don't import SettingsModule) now injects it to check auth
// maintenance on every authenticated request.
@Global()
@Module({
  imports: [StorageModule, OtpModule],
  controllers: [SettingsController, PublicSettingsController, StreamPublicSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class SettingsModule {}
