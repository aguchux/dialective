import { Module } from '@nestjs/common';
import { AnalyticsReportController } from './analytics-report.controller';
import { AnalyticsReportService } from './analytics-report.service';
import { AnalyticsRealtimeService } from './analytics-realtime.service';

@Module({
  controllers: [AnalyticsReportController],
  providers: [AnalyticsReportService, AnalyticsRealtimeService],
})
export class AnalyticsModule {}
