import { Controller, Get } from '@nestjs/common';
import { CommunityStatsService } from './community-stats.service';

// Aggregate counts only, nothing personal -- always public.
@Controller('community/stats')
export class CommunityStatsController {
  constructor(private readonly stats: CommunityStatsService) {}

  @Get()
  get() {
    return this.stats.getStats();
  }
}
