import { Module } from '@nestjs/common';
import { AnalyticsReportController } from './analytics-report.controller';
import { AnalyticsReportService } from './analytics-report.service';

@Module({
  controllers: [AnalyticsReportController],
  providers: [AnalyticsReportService],
})
export class AnalyticsModule {}
