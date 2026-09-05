import { Module } from '@nestjs/common';
import { AdminCommunityTagsController } from './admin-community-tags.controller';
import { CommunityTagsController } from './community-tags.controller';
import { CommunityTagsService } from './community-tags.service';

@Module({
  controllers: [CommunityTagsController, AdminCommunityTagsController],
  providers: [CommunityTagsService],
  exports: [CommunityTagsService],
})
export class CommunityTagsModule {}
