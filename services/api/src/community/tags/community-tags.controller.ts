import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../../auth/strategies/optional-jwt-auth.guard';
import { CommunityTagsService } from './community-tags.service';

// Content is public and shareable -- see CommunityPostsController's list().
@Controller('community/tags')
@UseGuards(OptionalJwtAuthGuard)
export class CommunityTagsController {
  constructor(private readonly tags: CommunityTagsService) {}

  @Get()
  list(@Query('q') q?: string) {
    return q ? this.tags.autocomplete(q) : this.tags.list();
  }
}
