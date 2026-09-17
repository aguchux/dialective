import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  OptionalJwtAuthGuard,
  OptionallyAuthenticatedRequest,
} from '../../auth/strategies/optional-jwt-auth.guard';
import { CommunitySearchService } from './community-search.service';

// Content is public and shareable -- see CommunityPostsController's list().
@Controller('community/search')
@UseGuards(OptionalJwtAuthGuard)
export class CommunitySearchController {
  constructor(private readonly searchService: CommunitySearchService) {}

  @Get()
  search(@Req() req: OptionallyAuthenticatedRequest, @Query('q') q: string) {
    return this.searchService.search(q ?? '', req.user?.sub);
  }
}
