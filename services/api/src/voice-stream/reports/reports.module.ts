import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ReportsController } from './reports.controller';
import { DatasetQualityReportService } from './dataset-quality-report.service';
import { SubscriberAnalyticsService } from './subscriber-analytics.service';
import { ValidationContributionReportService } from './validation-contribution-report.service';
import { ProvenanceReportService } from './provenance-report.service';
import { AccessLogExportService } from './access-log-export.service';
import { WebhookDeliveryExportService } from './webhook-delivery-export.service';
import { ActivityExportService } from './activity-export.service';
import { AnomalyEventsReportService } from './anomaly-events-report.service';

@Module({
  imports: [CatalogueModule],
  controllers: [ReportsController],
  providers: [
    DatasetQualityReportService,
    SubscriberAnalyticsService,
    ValidationContributionReportService,
    ProvenanceReportService,
    AccessLogExportService,
    WebhookDeliveryExportService,
    ActivityExportService,
    AnomalyEventsReportService,
  ],
})
export class ReportsModule {}
