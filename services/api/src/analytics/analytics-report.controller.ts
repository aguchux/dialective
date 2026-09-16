import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsReportService } from './analytics-report.service';
import { AnalyticsRealtimeService } from './analytics-realtime.service';
import { GetAnalyticsBreakdownDto, GetAnalyticsReportDto } from './dto/get-analytics-report.dto';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AnalyticsReportController {
  constructor(
    private readonly report: AnalyticsReportService,
    private readonly realtime: AnalyticsRealtimeService,
  ) {}

  @Get('summary')
  getSummary(@Query() query: GetAnalyticsReportDto) {
    return this.report.getSummary(query.days);
  }

  @Get('breakdown')
  getBreakdown(@Query() query: GetAnalyticsBreakdownDto) {
    return this.report.getBreakdown(query.dimension, query.days);
  }

  @Get('realtime')
  getRealtime() {
    return this.realtime.getSnapshot();
  }
}
