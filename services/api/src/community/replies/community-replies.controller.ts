import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CreateCommunityReplyDto } from '../dto/create-community-reply.dto';
import { ListCommunityRepliesDto } from '../dto/list-community-replies.dto';
import { CommunityRepliesService } from './community-replies.service';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityRepliesController {
  constructor(private readonly replies: CommunityRepliesService) {}

  @Get('posts/:postId/replies')
  list(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
    @Query() query: ListCommunityRepliesDto,
  ) {
    return this.replies.list(postId, query.sort, req.user.sub);
  }

  @Post('posts/:postId/replies')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60 * 60 * 1000 } })
  create(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
    @Body() dto: CreateCommunityReplyDto,
  ) {
    return this.replies.create(req.user.sub, postId, dto);
  }

  @Patch('replies/:id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('body') body: string) {
    return this.replies.update(req.user.sub, id, body);
  }

  @Delete('replies/:id')
  delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.replies.delete(req.user.sub, id);
  }
}
