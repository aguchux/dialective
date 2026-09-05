import { Module } from '@nestjs/common';
import { CommunitySearchController } from './community-search.controller';
import { CommunitySearchService } from './community-search.service';

@Module({
  controllers: [CommunitySearchController],
  providers: [CommunitySearchService],
})
export class CommunitySearchModule {}
