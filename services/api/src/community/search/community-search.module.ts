import { Module } from '@nestjs/common';
import { CommunityPostsModule } from '../posts/community-posts.module';
import { CommunitySearchController } from './community-search.controller';
import { CommunitySearchService } from './community-search.service';

@Module({
  imports: [CommunityPostsModule],
  controllers: [CommunitySearchController],
  providers: [CommunitySearchService],
})
export class CommunitySearchModule {}
