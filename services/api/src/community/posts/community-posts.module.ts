import { Module } from '@nestjs/common';
import { CommunityProfilesModule } from '../profiles/community-profiles.module';
import { CommunityTagsModule } from '../tags/community-tags.module';
import { AdminCommunityPostsController } from './admin-community-posts.controller';
import { CommunityPostsController } from './community-posts.controller';
import { CommunityPostsService } from './community-posts.service';

@Module({
  imports: [CommunityProfilesModule, CommunityTagsModule],
  controllers: [CommunityPostsController, AdminCommunityPostsController],
  providers: [CommunityPostsService],
  exports: [CommunityPostsService],
})
export class CommunityPostsModule {}
