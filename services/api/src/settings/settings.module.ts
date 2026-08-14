import { Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { PublicSettingsController, SettingsController } from './settings.controller';

@Module({
  controllers: [SettingsController, PublicSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class SettingsModule {}
