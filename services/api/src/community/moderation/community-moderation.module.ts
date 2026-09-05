import { Module } from '@nestjs/common';
import { CommunityNotificationsModule } from '../notifications/community-notifications.module';
import { CommunityPostsModule } from '../posts/community-posts.module';
import { CommunityRepliesModule } from '../replies/community-replies.module';
import { AdminCommunityModerationController } from './admin-community-moderation.controller';
import { CommunityModerationService } from './community-moderation.service';

@Module({
  imports: [CommunityPostsModule, CommunityRepliesModule, CommunityNotificationsModule],
  controllers: [AdminCommunityModerationController],
  providers: [CommunityModerationService],
  exports: [CommunityModerationService],
})
export class CommunityModerationModule {}
