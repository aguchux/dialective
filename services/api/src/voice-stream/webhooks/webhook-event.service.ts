import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventType } from '@dialectiva/db';
import { RedisStreamsService } from '../../redis-streams/redis-streams.service';

const WEBHOOK_STREAM = process.env.WEBHOOK_STREAM ?? 'webhook-deliveries';

/**
 * Single emission point every domain-event producer calls -- no other
 * module needs to know about WebhookSubscription rows, HMAC signing, or
 * delivery mechanics, only that "this thing happened, tell interested
 * subscribers." Publishes to a Redis stream (consumed in-process by
 * WebhookDeliveryConsumerService) rather than delivering synchronously,
 * same posture as IsvpService.submit's isvc-jobs publish: the domain write
 * that triggered this is already durable, so a publish failure here is
 * best-effort and never fails the caller.
 */
@Injectable()
export class WebhookEventService {
  private readonly logger = new Logger(WebhookEventService.name);

  constructor(private readonly streams: RedisStreamsService) {}

  async emit(
    organizationId: string,
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.streams.publish(WEBHOOK_STREAM, {
        organization_id: organizationId,
        event_type: eventType,
        payload: JSON.stringify(payload),
        attempt: '1',
      });
    } catch (err) {
      this.logger.error(
        `Failed to publish webhook-deliveries for org=${organizationId} event=${eventType}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
