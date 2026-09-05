import { Module } from '@nestjs/common';
import { CommunityBookmarksController } from './community-bookmarks.controller';
import { CommunityBookmarksService } from './community-bookmarks.service';

@Module({
  controllers: [CommunityBookmarksController],
  providers: [CommunityBookmarksService],
})
export class CommunityBookmarksModule {}
