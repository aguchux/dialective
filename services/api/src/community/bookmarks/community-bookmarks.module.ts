import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { CommunityBookmarksController } from './community-bookmarks.controller';
import { CommunityBookmarksService } from './community-bookmarks.service';

@Module({
  imports: [StorageModule],
  controllers: [CommunityBookmarksController],
  providers: [CommunityBookmarksService],
})
export class CommunityBookmarksModule {}
