import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityStatsService } from './community-stats.service';

@Controller('community/stats')
export class CommunityStatsController {
  constructor(private readonly stats: CommunityStatsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  get() {
    return this.stats.getStats();
  }
}
