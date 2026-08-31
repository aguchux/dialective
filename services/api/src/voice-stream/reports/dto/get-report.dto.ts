import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ActivityEventType, WebhookEventType } from '@dialectiva/db';

export class SubscriberAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}

export class SubscriberAnalyticsTimeSeriesQueryDto {
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @Type(() => Date)
  @IsDate()
  to!: Date;
}

export class FormatOnlyQueryDto {
  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}

export class AccessLogExportQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsString()
  entitlementDecision?: string;

  @IsOptional()
  @IsString()
  requestType?: string;

  @IsOptional()
  @IsString()
  deckId?: string;

  @IsOptional()
  @IsString()
  streamApiKeyId?: string;

  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}

export class WebhookDeliveryExportQueryDto {
  @IsOptional()
  @IsEnum(WebhookEventType)
  eventType?: WebhookEventType;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  succeeded?: boolean;

  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}

export class ActivityExportQueryDto {
  @IsOptional()
  @IsEnum(ActivityEventType)
  eventType?: ActivityEventType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}

