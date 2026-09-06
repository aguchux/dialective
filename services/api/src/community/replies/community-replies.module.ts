import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { CommunityProfilesModule } from '../profiles/community-profiles.module';
import { CommunityNotificationsModule } from '../notifications/community-notifications.module';
import { CommunityRepliesController } from './community-replies.controller';
import { CommunityRepliesService } from './community-replies.service';

@Module({
  imports: [CommunityProfilesModule, CommunityNotificationsModule, StorageModule],
  controllers: [CommunityRepliesController],
  providers: [CommunityRepliesService],
  exports: [CommunityRepliesService],
})
export class CommunityRepliesModule {}
