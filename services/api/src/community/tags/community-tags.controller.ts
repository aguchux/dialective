import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityTagsService } from './community-tags.service';

@Controller('community/tags')
@UseGuards(JwtAuthGuard)
export class CommunityTagsController {
  constructor(private readonly tags: CommunityTagsService) {}

  @Get()
  list(@Query('q') q?: string) {
    return q ? this.tags.autocomplete(q) : this.tags.list();
  }
}
