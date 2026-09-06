import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunitySearchService } from './community-search.service';

@Controller('community/search')
@UseGuards(JwtAuthGuard)
export class CommunitySearchController {
  constructor(private readonly searchService: CommunitySearchService) {}

  @Get()
  search(@Req() req: AuthenticatedRequest, @Query('q') q: string) {
    return this.searchService.search(q ?? '', req.user.sub);
  }
}
