import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CommunityReportStatus, Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunityReportsService } from './community-reports.service';

@Controller('admin/community/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunityReportsController {
  constructor(private readonly reports: CommunityReportsService) {}

  @Get()
  list(@Query('status') status?: CommunityReportStatus) {
    return this.reports.listForAdmin(status);
  }

  @Post(':id/assign')
  assign(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reports.assign(id, req.user.sub);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.reports.resolve(id);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.reports.dismiss(id);
  }
}
