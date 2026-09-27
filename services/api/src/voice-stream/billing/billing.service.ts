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
/**
 * The payment intent behind an invoice.
 *
 * Read through `payments` rather than a top-level field, because Stripe's
 * newer invoice shape moved it there. Worth reading explicitly: this is the id
 * every refund and dispute joins back on, since Charge carries payment_intent
 * but not invoice.
 */
function paymentIntentIdOf(invoice: Stripe.Invoice): string | undefined {
  for (const payment of invoice.payments?.data ?? []) {
    const intent = payment.payment?.payment_intent;
    if (typeof intent === 'string') return intent;
    if (intent?.id) return intent.id;
  }
  return undefined;
}

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
      throw new Error(
        'Stripe secret key is not configured (Admin -> Settings -> Stripe & Subscriptions)',
      );
    }
    return new Stripe(secretKey);
  }

  async createCheckoutSession(
    organizationId: string,
    userEmail: string,
    planKey: string,
  ): Promise<{ checkoutUrl?: string; activated?: true }> {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.active) {
      throw new NotFoundException('Unknown subscription plan');
    }

    if (plan.monthlyUsdAmount.eq(0)) {
      const currentSubscription = await this.prisma.subscription.findUnique({
        where: { organizationId },
        select: { stripeSubscriptionId: true },
      });
      // A downgrade must stop any existing Stripe billing before the internal
      // free access is activated. Fresh free organizations need no Stripe key.
      if (currentSubscription?.stripeSubscriptionId) {
        const stripe = await this.getStripe();
        await stripe.subscriptions.cancel(currentSubscription.stripeSubscriptionId);
      }
      await this.prisma.subscription.upsert({
        where: { organizationId },
        create: { organizationId, planId: plan.id, status: SubscriptionStatus.ACTIVE },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      });
      void this.webhookEvents.emit(organizationId, WebhookEventType.SUBSCRIPTION_ACTIVATED, {
        organization_id: organizationId,
        plan_key: plan.key,
        free: true,
      });
      return { activated: true };
    }
    if (!plan.stripePriceId) {
      throw new BadRequestException('This paid plan has no Stripe Price ID configured');
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
      plan: {
        ...subscription.plan,
        monthlyByteQuota: subscription.plan.monthlyByteQuota?.toString() ?? null,
      },
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
      throw new Error(
        'Stripe webhook secret is not configured (Admin -> Settings -> Stripe & Subscriptions)',
      );
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
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
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

      // The only event that records money ARRIVING. Everything else in this
      // switch records a state change; this one records a receipt, and it is
      // the sole basis for a contributor revenue-sharing pool.
      case 'invoice.payment_succeeded': {
        await this.recordPayment(event.data.object as Stripe.Invoice);
        return;
      }

      // Reversals. Both arrive as Charge events, and Charge carries
      // payment_intent but not invoice, which is why SubscriptionPayment stores
      // the intent id -- it is the only join back to the payment being undone.
      case 'charge.refunded':
      case 'charge.dispute.created': {
        await this.recordReversal(event);
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

  /**
   * Record a settled subscription payment.
   *
   * Deliberately narrow: it records what Stripe reported and derives nothing.
   * No amount is computed from a plan price, no period is inferred from a
   * calendar month, and `paidAt` comes from Stripe's own
   * status_transitions.paid_at rather than the time this row was written -- a
   * webhook can be delivered late, and a pool that drew on the wrong period
   * would pay the wrong contributors.
   *
   * Skips anything that is not a subscription payment. A one-off invoice is
   * real revenue, but it is not what a contributor's recording earned against,
   * so admitting it would put money in a pool with no usage period behind it.
   */
  private async recordPayment(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.id) {
      this.logger.warn('invoice.payment_succeeded with no invoice id, ignoring');
      return;
    }

    const stripeSubscriptionId =
      typeof invoice.parent?.subscription_details?.subscription === 'string'
        ? invoice.parent.subscription_details.subscription
        : invoice.parent?.subscription_details?.subscription?.id;

    if (!stripeSubscriptionId) {
      this.logger.log(
        `invoice.payment_succeeded invoice=${invoice.id} has no subscription parent -- not pool revenue, skipped`,
      );
      return;
    }

    // The organisation comes from OUR subscription row, never from invoice
    // metadata: metadata is caller-supplied, and a payment attributed to the
    // wrong org would pay the wrong contributors.
    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
      select: { organizationId: true },
    });
    if (!subscription) {
      this.logger.warn(
        `invoice.payment_succeeded references unknown subscription=${stripeSubscriptionId}, invoice=${invoice.id}`,
      );
      return;
    }

    // Zero-amount invoices are normal on a free plan or a fully-discounted
    // period. They are not revenue, and a zero pool has nothing to divide.
    if (invoice.amount_paid <= 0) {
      this.logger.log(
        `invoice.payment_succeeded invoice=${invoice.id} paid 0 -- no revenue to record`,
      );
      return;
    }

    const paidAtUnix = invoice.status_transitions?.paid_at;

    await this.prisma.subscriptionPayment.upsert({
      where: { stripeInvoiceId: invoice.id },
      // Upsert rather than create: two DIFFERENT Stripe events can reference
      // one invoice, so the event-id gate in handleWebhook does not by itself
      // make this idempotent. The unique on stripeInvoiceId does.
      update: {},
      create: {
        organizationId: subscription.organizationId,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentIdOf(invoice),
        stripeSubscriptionId,
        amountPaidCents: invoice.amount_paid,
        currency: invoice.currency,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        // Falls back to now only when Stripe omitted it, which should not
        // happen on a succeeded payment. Logged below so a systematic absence
        // is visible rather than quietly becoming "whenever we processed it".
        paidAt: paidAtUnix ? new Date(paidAtUnix * 1000) : new Date(),
      },
    });

    if (!paidAtUnix) {
      this.logger.warn(
        `invoice.payment_succeeded invoice=${invoice.id} had no status_transitions.paid_at; used receipt time`,
      );
    }

    this.logger.log(
      `Recorded subscription payment org=${subscription.organizationId} invoice=${invoice.id} amount=${invoice.amount_paid}${invoice.currency.toUpperCase()}`,
    );
  }

  /**
   * Mark a payment reversed.
   *
   * A refund or dispute means the platform does not have that money. The
   * payment row is not deleted -- it did happen, and a pool may already have
   * drawn on it -- so the reversal is recorded alongside it and settlement
   * compensates from there.
   *
   * `charge.dispute.created` is treated as a full reversal when the dispute
   * OPENS, rather than waiting for it to resolve. Deliberately pessimistic:
   * continuing to pay royalties out of money being clawed back is the more
   * expensive mistake, and a dispute resolved in our favour can be un-marked.
   */
  private async recordReversal(event: Stripe.Event): Promise<void> {
    const charge =
      event.type === 'charge.refunded'
        ? (event.data.object as Stripe.Charge)
        : await this.chargeForDispute(event.data.object as Stripe.Dispute);
    if (!charge) return;

    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!paymentIntentId) return;

    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true, organizationId: true, amountPaidCents: true },
    });
    if (!payment) {
      // Not every charge is a subscription payment. This is the expected
      // outcome for any other Stripe activity on the account.
      return;
    }

    const reversedCents =
      event.type === 'charge.refunded'
        ? charge.amount_refunded
        : // A dispute reports no refunded amount, so the whole payment is
          // treated as at risk -- see the doc comment above.
          payment.amountPaidCents;

    await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { refundedAt: new Date(), refundedAmountCents: reversedCents },
    });

    this.logger.warn(
      `Subscription payment reversed org=${payment.organizationId} payment=${payment.id} reversed=${reversedCents} of ${payment.amountPaidCents} via ${event.type}`,
    );
  }

  /** A dispute references its charge by id; the charge carries the payment intent. */
  private async chargeForDispute(dispute: Stripe.Dispute): Promise<Stripe.Charge | null> {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    if (!chargeId) return null;
    const stripe = await this.getStripe();
    try {
      return await stripe.charges.retrieve(chargeId);
    } catch (err) {
      this.logger.error(
        `Could not retrieve charge=${chargeId} for dispute=${dispute.id}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
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
