import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { OptionalJwtAuthGuard, OptionallyAuthenticatedRequest } from '../../auth/strategies/optional-jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CreateCommunityPostDto } from '../dto/create-community-post.dto';
import { UpdateCommunityPostDto } from '../dto/update-community-post.dto';
import { ListCommunityPostsDto } from '../dto/list-community-posts.dto';
import { CommunityPostsService } from './community-posts.service';

@Controller('community/posts')
export class CommunityPostsController {
  constructor(private readonly posts: CommunityPostsService) {}

  // Content is public and shareable -- OptionalJwtAuthGuard decodes a
  // token when one is sent but never requires it, so a signed-out visitor
  // still gets the feed/post (just without likedByMe/bookmarkedByMe/etc).
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Req() req: OptionallyAuthenticatedRequest, @Query() query: ListCommunityPostsDto) {
    return this.posts.list(req.user?.sub, query);
  }

  // Must be registered before the `:id` route below, or Nest would try to
  // resolve "mine" as a post id/slug.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: AuthenticatedRequest, @Query('cursor') cursor?: string) {
    return this.posts.listMine(req.user.sub, cursor);
  }

  @Post()
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCommunityPostDto) {
    return this.posts.create(req.user.sub, dto);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getById(@Req() req: OptionallyAuthenticatedRequest, @Param('id') id: string) {
    return this.posts.getById(id, req.user?.sub);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateCommunityPostDto) {
    return this.posts.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.posts.delete(req.user.sub, id);
  }
}
