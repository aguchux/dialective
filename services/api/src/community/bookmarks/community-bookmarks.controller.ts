import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityBookmarksService } from './community-bookmarks.service';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityBookmarksController {
  constructor(private readonly bookmarks: CommunityBookmarksService) {}

  @Post('posts/:id/bookmark')
  add(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.bookmarks.add(req.user.sub, id);
  }

  @Delete('posts/:id/bookmark')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.bookmarks.remove(req.user.sub, id);
  }

  @Get('me/bookmarks')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.bookmarks.listMine(req.user.sub);
  }
}
