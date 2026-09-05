import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunitySearchService } from './community-search.service';

@Controller('community/search')
@UseGuards(JwtAuthGuard)
export class CommunitySearchController {
  constructor(private readonly searchService: CommunitySearchService) {}

  @Get()
  search(@Query('q') q: string) {
    return this.searchService.search(q ?? '');
  }
}
