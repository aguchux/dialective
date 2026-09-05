import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CreateCommunityPostDto } from '../dto/create-community-post.dto';
import { UpdateCommunityPostDto } from '../dto/update-community-post.dto';
import { ListCommunityPostsDto } from '../dto/list-community-posts.dto';
import { CommunityPostsService } from './community-posts.service';

@Controller('community/posts')
@UseGuards(JwtAuthGuard)
export class CommunityPostsController {
  constructor(private readonly posts: CommunityPostsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListCommunityPostsDto) {
    return this.posts.list(req.user.sub, query);
  }

  @Post()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCommunityPostDto) {
    return this.posts.create(req.user.sub, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.posts.getById(id);
  }

  @Patch(':id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateCommunityPostDto) {
    return this.posts.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.posts.delete(req.user.sub, id);
  }
}
