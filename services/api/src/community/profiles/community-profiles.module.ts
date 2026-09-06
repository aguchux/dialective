import { Module } from '@nestjs/common';
import { AdminCommunityProfilesController } from './admin-community-profiles.controller';
import { CommunityProfilesController } from './community-profiles.controller';
import { CommunityProfilesService } from './community-profiles.service';

@Module({
  controllers: [CommunityProfilesController, AdminCommunityProfilesController],
  providers: [CommunityProfilesService],
  exports: [CommunityProfilesService],
})
export class CommunityProfilesModule {}
