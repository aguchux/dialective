import { Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityReactionsService } from './community-reactions.service';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityReactionsController {
  constructor(private readonly reactions: CommunityReactionsService) {}

  @Post('posts/:id/like')
  likePost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reactions.likePost(req.user.sub, id);
  }

  @Delete('posts/:id/like')
  unlikePost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reactions.unlikePost(req.user.sub, id);
  }

  @Post('replies/:id/like')
  likeReply(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reactions.likeReply(req.user.sub, id);
  }

  @Delete('replies/:id/like')
  unlikeReply(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reactions.unlikeReply(req.user.sub, id);
  }
}
