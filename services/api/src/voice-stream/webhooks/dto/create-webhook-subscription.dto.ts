import { ArrayNotEmpty, IsArray, IsEnum, IsUrl } from 'class-validator';
import { WebhookEventType } from '@dialectiva/db';

export class CreateWebhookSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEventType, { each: true })
  eventTypes!: WebhookEventType[];
}
