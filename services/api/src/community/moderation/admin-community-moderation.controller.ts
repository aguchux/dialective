import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityModerationService } from './community-moderation.service';

@Controller('admin/community/moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunityModerationController {
  constructor(private readonly moderation: CommunityModerationService) {}

  @Post('posts/:id/hide')
  hidePost(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.moderation.hidePost(req.user.sub, id, reason);
  }

  @Post('posts/:id/restore')
  restorePost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.moderation.restorePost(req.user.sub, id);
  }

  @Post('posts/:id/delete')
  deletePost(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.moderation.deletePost(req.user.sub, id, reason);
  }

  @Post('posts/:id/lock')
  lockThread(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.moderation.lockThread(req.user.sub, id);
  }

  @Post('posts/:id/unlock')
  unlockThread(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.moderation.unlockThread(req.user.sub, id);
  }

  @Post('posts/:id/pin')
  pinPost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.moderation.pinPost(req.user.sub, id);
  }

  @Post('posts/:id/unpin')
  unpinPost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.moderation.unpinPost(req.user.sub, id);
  }

  @Post('replies/:id/delete')
  deleteReply(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.moderation.deleteReply(req.user.sub, id, reason);
  }

  @Post('users/:profileId/warn')
  warnUser(
    @Req() req: AuthenticatedRequest,
    @Param('profileId') profileId: string,
    @Body('reason') reason: string,
  ) {
    return this.moderation.warnUser(req.user.sub, profileId, reason);
  }

  @Post('users/:profileId/suspend')
  suspendUser(
    @Req() req: AuthenticatedRequest,
    @Param('profileId') profileId: string,
    @Body('reason') reason?: string,
  ) {
    return this.moderation.suspendUser(req.user.sub, profileId, reason);
  }

  @Post('users/:profileId/ban')
  banUser(
    @Req() req: AuthenticatedRequest,
    @Param('profileId') profileId: string,
    @Body('reason') reason?: string,
  ) {
    return this.moderation.banUser(req.user.sub, profileId, reason);
  }

  @Post('users/:profileId/restore')
  restoreUser(@Req() req: AuthenticatedRequest, @Param('profileId') profileId: string) {
    return this.moderation.restoreUser(req.user.sub, profileId);
  }

  @Get('log')
  auditLog() {
    return this.moderation.listAuditLog();
  }
}
