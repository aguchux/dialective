import { Module } from '@nestjs/common';
import {
  CommunityPublicSettingsController,
  CommunitySettingsController,
} from './community-settings.controller';
import { CommunitySettingsService } from './community-settings.service';

@Module({
  controllers: [CommunitySettingsController, CommunityPublicSettingsController],
  providers: [CommunitySettingsService],
  exports: [CommunitySettingsService],
})
export class CommunitySettingsModule {}
