import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { Prisma, SubscriptionStatus, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiAccessTokensService } from '../../api-access-tokens/api-access-tokens.service';
import { WebhookEventService } from '../webhooks/webhook-event.service';

function streamFrontendUrl(): string {
  return process.env.STREAM_FRONTEND_URL ?? 'https://stream.dialectlibrary.com';
}

/**
 * Maps Stripe's own subscription statuses onto our narrower
 * SubscriptionStatus enum. Stripe's `trialing`/`active` map directly;
 * `past_due`/`unpaid` map to PAST_DUE (Stripe's own retry schedule handles
 * dunning -- see docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md section
 * 43, Phase 1 doesn't reimplement that cron); `canceled`/`incomplete_expired`
 * map to CANCELED.
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return SubscriptionStatus.TRIAL;
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
    case 'unpaid':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
    case 'incomplete_expired':
      return SubscriptionStatus.CANCELED;
    case 'incomplete':
    case 'paused':
    default:
      return SubscriptionStatus.GRACE_PERIOD;
  }
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiAccessTokens: ApiAccessTokensService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  private async getStripe(): Promise<Stripe> {
    const secretKey = await this.apiAccessTokens.getDecrypted('stripe_secret_key');
    if (!secretKey) {
      throw new Error('Stripe secret key is not configured (Admin -> Settings -> Stripe & Subscriptions)');
    }
    return new Stripe(secretKey);
  }

  async createCheckoutSession(
    organizationId: string,
    userEmail: string,
    planKey: string,
  ): Promise<{ checkoutUrl: string }> {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.active) {
      throw new NotFoundException('Unknown subscription plan');
    }

    const org = await this.prisma.subscriberOrganization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const stripe = await this.getStripe();
    const customerId =
      org.stripeCustomerId ??
      (
        await stripe.customers.create({
          email: userEmail,
          name: org.name,
          metadata: { organizationId: org.id },
        })
      ).id;

    if (!org.stripeCustomerId) {
      await this.prisma.subscriberOrganization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: organizationId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${streamFrontendUrl()}/dashboard/billing?checkout=success`,
      cancel_url: `${streamFrontendUrl()}/dashboard/billing?checkout=canceled`,
      metadata: { organizationId, planKey },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { checkoutUrl: session.url };
  }

  async getSubscriptionStatus(organizationId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription) return subscription;
    // plan.monthlyByteQuota is a Prisma BigInt -- JSON.stringify can't
    // serialize it, so convert before this reaches the controller.
    return {
      ...subscription,
      plan: { ...subscription.plan, monthlyByteQuota: subscription.plan.monthlyByteQuota?.toString() ?? null },
    };
  }

  /**
   * Verifies the Stripe signature over the raw request body, then records
   * the event by Stripe's own event.id (idempotency: a re-delivered event
   * with the same id is a no-op if already processedAt), mirroring
   * wallet.controller.ts's NOWPayments/Flutterwave webhook dedup pattern.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const webhookSecret = await this.apiAccessTokens.getDecrypted('stripe_webhook_secret');
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret is not configured (Admin -> Settings -> Stripe & Subscriptions)');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    const stripe = await this.getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${err instanceof Error ? err.message : err}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const existing = await this.prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
    if (existing?.processedAt) {
      return; // already processed -- idempotent replay
    }

    await this.prisma.stripeWebhookEvent.upsert({
      where: { id: event.id },
      update: {},
      create: {
        id: event.id,
        type: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      await this.processEvent(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      this.logger.error(
        `Failed to process Stripe webhook event=${event.id} type=${event.type}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
        const planKey = session.metadata?.planKey;
        const stripeSubscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (!organizationId || !planKey || !stripeSubscriptionId) {
          this.logger.warn(`checkout.session.completed missing metadata, session=${session.id}`);
          return;
        }
        const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
        if (!plan) {
          this.logger.warn(`checkout.session.completed references unknown planKey=${planKey}`);
          return;
        }
        await this.prisma.subscription.upsert({
          where: { organizationId },
          update: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            stripeSubscriptionId,
          },
          create: {
            organizationId,
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            stripeSubscriptionId,
          },
        });
        void this.webhookEvents.emit(organizationId, WebhookEventType.SUBSCRIPTION_ACTIVATED, {
          organization_id: organizationId,
          plan_key: planKey,
        });
        return;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await this.syncSubscriptionFromStripe(sub);
        return;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: SubscriptionStatus.CANCELED },
        });
        return;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === 'string'
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
        if (!stripeSubscriptionId) return;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId },
          data: { status: SubscriptionStatus.PAST_DUE },
        });
        const subscription = await this.prisma.subscription.findFirst({
          where: { stripeSubscriptionId },
          select: { organizationId: true },
        });
        if (subscription) {
          void this.webhookEvents.emit(
            subscription.organizationId,
            WebhookEventType.SUBSCRIPTION_PAYMENT_FAILED,
            { organization_id: subscription.organizationId },
          );
        }
        return;
      }

      default:
        return; // event types we don't act on yet
    }
  }

  private async syncSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
    const status = mapStripeStatus(sub.status);
    const currentPeriodEndUnix = sub.items.data[0]?.current_period_end;
    const currentPeriodStartUnix = sub.items.data[0]?.current_period_start;
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id },
      data: {
        status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: currentPeriodStartUnix
          ? new Date(currentPeriodStartUnix * 1000)
          : undefined,
        currentPeriodEnd: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000) : undefined,
      },
    });
  }
}
