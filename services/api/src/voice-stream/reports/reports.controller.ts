import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { DatasetQualityReportService } from './dataset-quality-report.service';
import { SubscriberAnalyticsService } from './subscriber-analytics.service';
import { ValidationContributionReportService } from './validation-contribution-report.service';
import { ProvenanceReportService } from './provenance-report.service';
import { AccessLogExportService } from './access-log-export.service';
import { WebhookDeliveryExportService } from './webhook-delivery-export.service';
import { ActivityExportService } from './activity-export.service';
import { AnomalyEventsReportService } from './anomaly-events-report.service';
import {
  AccessLogExportQueryDto,
  ActivityExportQueryDto,
  FormatOnlyQueryDto,
  SubscriberAnalyticsQueryDto,
  SubscriberAnalyticsTimeSeriesQueryDto,
  WebhookDeliveryExportQueryDto,
} from './dto/get-report.dto';
import { respondJsonOrCsv } from './csv.util';

@Controller('voice-stream/reports')
@UseGuards(SubscriberAuthGuard)
export class ReportsController {
  constructor(
    private readonly datasetQuality: DatasetQualityReportService,
    private readonly subscriberAnalytics: SubscriberAnalyticsService,
    private readonly validationContributions: ValidationContributionReportService,
    private readonly provenance: ProvenanceReportService,
    private readonly accessLogExport: AccessLogExportService,
    private readonly webhookDeliveryExport: WebhookDeliveryExportService,
    private readonly activityExport: ActivityExportService,
    private readonly anomalyEvents: AnomalyEventsReportService,
  ) {}

  @Get('dataset-quality')
  async datasetQualityReport(@Query() query: FormatOnlyQueryDto, @Res() res: Response) {
    const report = await this.datasetQuality.build();
    respondJsonOrCsv(res, 'dataset-quality-report.csv', query.format, report);
  }

  @Get('subscriber-analytics')
  async subscriberAnalyticsReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: SubscriberAnalyticsQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.subscriberAnalytics.build(subscriber.organizationId, query.from, query.to);
    respondJsonOrCsv(res, 'subscriber-analytics-report.csv', query.format, report);
  }

  @Get('subscriber-analytics/time-series')
  async subscriberAnalyticsTimeSeries(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: SubscriberAnalyticsTimeSeriesQueryDto,
  ) {
    return this.subscriberAnalytics.buildTimeSeries(subscriber.organizationId, query.from, query.to);
  }

  @Get('validation-contributions')
  async validationContributionReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: FormatOnlyQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.validationContributions.build(subscriber.organizationId);
    respondJsonOrCsv(res, 'validation-contribution-report.csv', query.format, report);
  }

  @Get('provenance/:deckId/:version')
  async provenanceReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('deckId') deckId: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() query: FormatOnlyQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.provenance.build(subscriber.organizationId, deckId, version);
    respondJsonOrCsv(res, `provenance-report-v${version}.csv`, query.format, report);
  }

  @Get('access-log')
  async accessLogReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: AccessLogExportQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.accessLogExport.build(subscriber.organizationId, {
      from: query.from,
      to: query.to,
      entitlementDecision: query.entitlementDecision,
      requestType: query.requestType,
      deckId: query.deckId,
      streamApiKeyId: query.streamApiKeyId,
    });
    respondJsonOrCsv(res, 'access-log-export.csv', query.format, report);
  }

  @Get('webhook-deliveries')
  async webhookDeliveriesReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: WebhookDeliveryExportQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.webhookDeliveryExport.build(subscriber.organizationId, {
      eventType: query.eventType,
      succeeded: query.succeeded,
    });
    respondJsonOrCsv(res, 'webhook-deliveries-export.csv', query.format, report);
  }

  @Get('activity')
  async activityReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: ActivityExportQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.activityExport.build(subscriber.organizationId, {
      eventType: query.eventType,
      from: query.from,
      to: query.to,
    });
    respondJsonOrCsv(res, 'activity-export.csv', query.format, report);
  }

  @Get('anomalies')
  async anomaliesReport(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query() query: FormatOnlyQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.anomalyEvents.build(subscriber.organizationId);
    respondJsonOrCsv(res, 'anomaly-events.csv', query.format, report);
  }
}
