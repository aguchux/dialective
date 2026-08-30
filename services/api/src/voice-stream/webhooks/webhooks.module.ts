import { Module } from '@nestjs/common';
import { RedisStreamsModule } from '../../redis-streams/redis-streams.module';
import { WebhookEventService } from './webhook-event.service';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';
import { WebhookSubscriptionsController } from './webhook-subscriptions.controller';
import { WebhookDeliveryConsumerService } from './webhook-delivery-consumer.service';

/**
 * Dialect Library Voice Stream -- Phase 4b (Webhooks). WebhookEventService
 * is exported for every domain-event-producing module (subscriber-auth,
 * billing, stream-decks, isvp, stream-api) to import and call `.emit(...)`
 * from; WebhookSubscriptionsController/Service is the dashboard-side
 * management surface; WebhookDeliveryConsumerService is the in-process
 * consumer that actually delivers events (see doc section 51).
 */
@Module({
  imports: [RedisStreamsModule],
  controllers: [WebhookSubscriptionsController],
  providers: [WebhookEventService, WebhookSubscriptionsService, WebhookDeliveryConsumerService],
  exports: [WebhookEventService],
})
export class WebhooksModule {}
