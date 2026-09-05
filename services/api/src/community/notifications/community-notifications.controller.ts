import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityNotificationsService } from './community-notifications.service';

@Controller('community/notifications')
@UseGuards(JwtAuthGuard)
export class CommunityNotificationsController {
  constructor(private readonly notifications: CommunityNotificationsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('tab') tab?: 'replies' | 'mentions' | 'announcements') {
    return this.notifications.list(req.user.sub, tab);
  }

  @Post(':id/read')
  markRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notifications.markRead(req.user.sub, id);
  }

  @Post('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.sub);
  }
}
