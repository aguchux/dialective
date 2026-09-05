import { Module } from '@nestjs/common';
import { CommunityNotificationsController } from './community-notifications.controller';
import { CommunityNotificationsService } from './community-notifications.service';

@Module({
  controllers: [CommunityNotificationsController],
  providers: [CommunityNotificationsService],
  exports: [CommunityNotificationsService],
})
export class CommunityNotificationsModule {}
