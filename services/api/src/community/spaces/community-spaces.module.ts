import { Module } from '@nestjs/common';
import { CommunityProfilesModule } from '../profiles/community-profiles.module';
import { AdminCommunitySpacesController } from './admin-community-spaces.controller';
import { CommunitySpacesController } from './community-spaces.controller';
import { CommunitySpacesService } from './community-spaces.service';

@Module({
  imports: [CommunityProfilesModule],
  controllers: [CommunitySpacesController, AdminCommunitySpacesController],
  providers: [CommunitySpacesService],
  exports: [CommunitySpacesService],
})
export class CommunitySpacesModule {}
