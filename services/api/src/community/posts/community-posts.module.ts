import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { CommunityProfilesModule } from '../profiles/community-profiles.module';
import { CommunityTagsModule } from '../tags/community-tags.module';
import { CommunitySettingsModule } from '../settings/community-settings.module';
import { AdminCommunityPostsController } from './admin-community-posts.controller';
import { CommunityPostsController } from './community-posts.controller';
import { CommunityPostsService } from './community-posts.service';

@Module({
  imports: [CommunityProfilesModule, CommunityTagsModule, StorageModule, CommunitySettingsModule],
  controllers: [CommunityPostsController, AdminCommunityPostsController],
  providers: [CommunityPostsService],
  exports: [CommunityPostsService],
})
export class CommunityPostsModule {}
