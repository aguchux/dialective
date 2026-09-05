import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CreateCommunityReportDto } from '../dto/create-community-report.dto';
import { CommunityReportsService } from './community-reports.service';

@Controller('community/reports')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
export class CommunityReportsController {
  constructor(private readonly reports: CommunityReportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  file(@Req() req: AuthenticatedRequest, @Body() dto: CreateCommunityReportDto) {
    return this.reports.file(req.user.sub, dto);
  }
}
