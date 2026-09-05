import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Prisma, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamsService, StreamMessage } from '../../redis-streams/redis-streams.service';
import { assertPublicHostname } from '../../common/ssrf-guard.util';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';

const WEBHOOK_STREAM = process.env.WEBHOOK_STREAM ?? 'webhook-deliveries';
const CONSUMER_GROUP = process.env.WEBHOOK_CONSUMER_GROUP ?? 'webhook-delivery-consumers';
const CONSUMER_NAME = process.env.HOSTNAME ?? 'api-webhook-delivery-1';
const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * In-process consumer (same precedent as SmartDeckEvaluatorService) --
 * delivery doesn't need domain-service access, but every event producer
 * already lives inside `api` and delivery isn't compute-heavy enough to
 * justify a standalone deployable. Deliberately does NOT implement its own
 * retry/backoff: on a failed delivery it rethrows, letting
 * RedisStreamsService.consume's own reclaim loop (MAX_DELIVERY_ATTEMPTS=3,
 * 5-min idle reclaim, dead-letter to webhook-deliveries-dead) do the retry
 * work -- the same mechanism every other Redis Streams consumer in this
 * codebase already relies on.
 */
@Injectable()
export class WebhookDeliveryConsumerService implements OnModuleInit {
  private readonly logger = new Logger(WebhookDeliveryConsumerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: RedisStreamsService,
    private readonly subscriptions: WebhookSubscriptionsService,
  ) {}

  onModuleInit() {
    this.streams
      .consume(WEBHOOK_STREAM, CONSUMER_GROUP, CONSUMER_NAME, (msg) => this.handle(msg))
      .catch((err) => this.logger.error(`Consumer loop crashed: ${err.message}`));
  }

  private async handle(message: StreamMessage): Promise<void> {
    const {
      organization_id: organizationId,
      event_type: eventType,
      payload: payloadRaw,
      attempt: attemptRaw,
    } = message.data;
    if (!organizationId || !eventType || !payloadRaw) {
      this.logger.warn(`Received webhook job with missing fields: ${JSON.stringify(message.data)}`);
      return;
    }

    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    const attemptNumber = attemptRaw ? Number(attemptRaw) : 1;

    const subscribers = await this.subscriptions.findActiveSubscribers(
      organizationId,
      eventType as WebhookEventType,
    );

    // A failure delivering to ANY one subscriber must still let the others
    // be attempted -- collect failures and rethrow after the loop so the
    // Streams reclaim/retry mechanism only re-processes the subscribers
    // that actually failed via their own logged attempt, not silently
    // skip the rest of the org's subscriptions on one bad endpoint.
    let anyFailed = false;
    for (const subscription of subscribers) {
      const delivered = await this.deliverToOne(
        subscription,
        eventType as WebhookEventType,
        payload,
        attemptNumber,
      );
      if (!delivered) anyFailed = true;
    }

    if (anyFailed) {
      throw new Error(
        `One or more webhook deliveries failed for org=${organizationId} event=${eventType}`,
      );
    }
  }

  private async deliverToOne(
    subscription: { id: string; url: string },
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
    attemptNumber: number,
  ): Promise<boolean> {
    const secret = await this.subscriptions.getDecryptedSecret(subscription.id);
    if (!secret) {
      await this.logDelivery(subscription.id, eventType, payload, attemptNumber, null, false, 'Signing secret not found');
      return false;
    }

    // Registration-time @IsUrl only checked the URL's shape, not where it
    // actually resolves -- re-validate immediately before every delivery
    // attempt so a hostname that reboinds to an internal/metadata address
    // after registration is still blocked, not just at signup.
    try {
      await assertPublicHostname(new URL(subscription.url).hostname);
    } catch {
      await this.logDelivery(subscription.id, eventType, payload, attemptNumber, null, false, 'Delivery blocked: endpoint not reachable');
      return false;
    }

    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dialectiva-Signature': `sha256=${signature}`,
          'X-Dialectiva-Event': eventType,
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      const succeeded = response.status >= 200 && response.status < 300;
      await this.logDelivery(
        subscription.id,
        eventType,
        payload,
        attemptNumber,
        response.status,
        succeeded,
        succeeded ? null : `Received HTTP ${response.status}`,
      );
      return succeeded;
    } catch (err) {
      // The raw connect-error message (ECONNREFUSED/ETIMEDOUT + the exact
      // host:port it hit) is a port-scan oracle over internal infrastructure
      // once it round-trips back to the org via delivery logs/CSV export --
      // log the real detail server-side only, store a generic message.
      this.logger.warn(
        `Webhook delivery to subscription=${subscription.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.logDelivery(
        subscription.id,
        eventType,
        payload,
        attemptNumber,
        null,
        false,
        'Delivery failed: endpoint did not respond',
      );
      return false;
    }
  }

  /** Never throws -- a logging failure must not take down the delivery it's logging, same posture as StreamAccessLogService.record. */
  private async logDelivery(
    subscriptionId: string,
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
    attemptNumber: number,
    resultCode: number | null,
    succeeded: boolean,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      await this.prisma.webhookDeliveryLog.create({
        data: {
          subscriptionId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          attemptNumber,
          resultCode,
          succeeded,
          errorMessage,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write WebhookDeliveryLog for subscription=${subscriptionId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
