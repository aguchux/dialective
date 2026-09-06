import { Module } from '@nestjs/common';
import { CommunityStatsController } from './community-stats.controller';
import { CommunityStatsService } from './community-stats.service';

@Module({
  controllers: [CommunityStatsController],
  providers: [CommunityStatsService],
})
export class CommunityStatsModule {}
