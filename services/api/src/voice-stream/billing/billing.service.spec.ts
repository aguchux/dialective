const constructEventMock = jest.fn();
const chargesRetrieveMock = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: constructEventMock },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { cancel: jest.fn() },
    charges: { retrieve: chargesRetrieveMock },
  }));
});

import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '@dialectiva/db';
import { BillingService } from './billing.service';

function setup() {
  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    subscriptionPlan: { findUnique: jest.fn() },
    subscription: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    subscriberOrganization: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    subscriptionPayment: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const apiAccessTokens = {
    getDecrypted: jest.fn((key: string) =>
      key === 'stripe_secret_key' ? 'sk_test_dummy' : 'whsec_dummy',
    ),
  };
  const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(prisma as any, apiAccessTokens as any, webhookEvents as any);
  return { prisma, service, apiAccessTokens, webhookEvents };
}

describe('BillingService.handleWebhook', () => {
  beforeEach(() => {
    constructEventMock.mockReset();
  });

  it('rejects an invalid signature', async () => {
    const { service } = setup();
    constructEventMock.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing signature header', async () => {
    const { service } = setup();
    await expect(service.handleWebhook(Buffer.from('{}'), undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('is a no-op on a replayed event that was already processed', async () => {
    const { prisma, service } = setup();
    constructEventMock.mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt_1',
      processedAt: new Date(),
    });

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.stripeWebhookEvent.upsert).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('activates a subscription on checkout.session.completed', async () => {
    const { prisma, service } = setup();
    constructEventMock.mockReturnValue({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'org-1',
          subscription: 'sub_1',
          metadata: { organizationId: 'org-1', planKey: 'starter' },
        },
      },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscriptionPlan.findUnique.mockResolvedValue({ id: 'plan-1', key: 'starter' });

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
        create: expect.objectContaining({
          organizationId: 'org-1',
          planId: 'plan-1',
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: 'sub_1',
        }),
      }),
    );
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { processedAt: expect.any(Date) } }),
    );
  });

  it('moves a subscription to PAST_DUE on invoice.payment_failed', async () => {
    const { prisma, service } = setup();
    constructEventMock.mockReturnValue({
      id: 'evt_3',
      type: 'invoice.payment_failed',
      data: {
        object: {
          parent: { subscription_details: { subscription: 'sub_1' } },
        },
      },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
  });

  it('cancels a subscription on customer.subscription.deleted', async () => {
    const { prisma, service } = setup();
    constructEventMock.mockReturnValue({
      id: 'evt_4',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { status: SubscriptionStatus.CANCELED },
    });
  });
});

describe('BillingService.createCheckoutSession', () => {
  it('activates a free plan without creating a Stripe customer or Checkout session', async () => {
    const { service, prisma, webhookEvents } = setup();
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'plan-free',
      key: 'community',
      active: true,
      monthlyUsdAmount: { eq: (amount: number) => amount === 0 },
      stripePriceId: null,
    });
    prisma.subscription.findUnique.mockResolvedValue(null);

    await expect(
      service.createCheckoutSession('org-1', 'owner@example.com', 'community'),
    ).resolves.toEqual({
      activated: true,
    });

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
        create: expect.objectContaining({ planId: 'plan-free', status: SubscriptionStatus.ACTIVE }),
      }),
    );
    expect(webhookEvents.emit).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      expect.objectContaining({ free: true }),
    );
  });
});

describe('BillingService.getSubscriptionStatus', () => {
  it('stringifies the BigInt plan.monthlyByteQuota (JSON.stringify cannot serialize a raw bigint)', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      plan: { key: 'enterprise', monthlyByteQuota: BigInt(1_000_000_000) },
    });

    const result = await service.getSubscriptionStatus('org-1');

    expect(result?.plan.monthlyByteQuota).toBe('1000000000');
  });

  it('returns null unchanged when there is no subscription', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findUnique.mockResolvedValue(null);

    const result = await service.getSubscriptionStatus('org-1');

    expect(result).toBeNull();
  });
});

/**
 * Recording money received is the prerequisite for every contributor pool. The
 * rule these tests exist to pin: a pool may only ever draw on a payment Stripe
 * confirmed settled, never on a plan price or a subscription status.
 */
describe('BillingService payment recording', () => {
  beforeEach(() => {
    constructEventMock.mockReset();
    chargesRetrieveMock.mockReset();
  });

  /** A subscription invoice that Stripe says was paid. */
  function paidInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'in_123',
      amount_paid: 3900,
      currency: 'usd',
      period_start: 1764547200,
      period_end: 1767225600,
      status_transitions: { paid_at: 1764550800 },
      parent: { subscription_details: { subscription: 'sub_123' } },
      payments: {
        data: [{ payment: { payment_intent: 'pi_123' } }],
      },
      ...overrides,
    };
  }

  function fireEvent(type: string, object: unknown) {
    constructEventMock.mockReturnValue({ id: `evt_${type}`, type, data: { object } });
  }

  it('records a settled subscription payment against the org from OUR subscription row', async () => {
    // Never from invoice metadata: that is caller-supplied, and a payment
    // attributed to the wrong org would pay the wrong contributors.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ organizationId: 'org-real' });
    fireEvent('invoice.payment_succeeded', paidInvoice());

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    const args = prisma.subscriptionPayment.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ stripeInvoiceId: 'in_123' });
    expect(args.create).toMatchObject({
      organizationId: 'org-real',
      amountPaidCents: 3900,
      currency: 'usd',
      stripePaymentIntentId: 'pi_123',
      stripeSubscriptionId: 'sub_123',
    });
  });

  it('takes paidAt from Stripe, not from processing time', async () => {
    // A webhook can be delivered late. A pool that drew on the wrong period
    // would pay the wrong contributors.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ organizationId: 'org-1' });
    fireEvent('invoice.payment_succeeded', paidInvoice());

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    const { create } = prisma.subscriptionPayment.upsert.mock.calls[0][0];
    expect(create.paidAt).toEqual(new Date(1764550800 * 1000));
    expect(create.periodStart).toEqual(new Date(1764547200 * 1000));
    expect(create.periodEnd).toEqual(new Date(1767225600 * 1000));
  });

  it('stores the amount unconverted, in the currency Stripe reported', async () => {
    // Converting on the way in would bake one day's FX rate into the permanent
    // record. The rate used belongs on the pool that used it.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ organizationId: 'org-1' });
    fireEvent('invoice.payment_succeeded', paidInvoice({ amount_paid: 4500, currency: 'ngn' }));

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    const { create } = prisma.subscriptionPayment.upsert.mock.calls[0][0];
    expect(create.amountPaidCents).toBe(4500);
    expect(create.currency).toBe('ngn');
  });

  it('upserts on the invoice id, so two events for one invoice cannot double-count', async () => {
    // The event-id gate catches an identical replay; it does NOT stop two
    // different events referencing the same invoice.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ organizationId: 'org-1' });
    fireEvent('invoice.payment_succeeded', paidInvoice());

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    const args = prisma.subscriptionPayment.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ stripeInvoiceId: 'in_123' });
    // An existing row is left alone rather than overwritten.
    expect(args.update).toEqual({});
  });

  it('ignores an invoice with no subscription parent', async () => {
    // Real revenue, but not what a contributor recording earned against -- it
    // has no usage period behind it.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    fireEvent('invoice.payment_succeeded', paidInvoice({ parent: null }));

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.upsert).not.toHaveBeenCalled();
  });

  it('ignores a zero-amount invoice', async () => {
    // Normal on a free plan or a fully-discounted period. Not revenue.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ organizationId: 'org-1' });
    fireEvent('invoice.payment_succeeded', paidInvoice({ amount_paid: 0 }));

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.upsert).not.toHaveBeenCalled();
  });

  it('ignores a payment for a subscription it does not know', async () => {
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue(null);
    fireEvent('invoice.payment_succeeded', paidInvoice());

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.upsert).not.toHaveBeenCalled();
  });

  it('records a partial refund as an amount, not a flag', async () => {
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscriptionPayment.findFirst.mockResolvedValue({
      id: 'pay-1',
      organizationId: 'org-1',
      amountPaidCents: 3900,
    });
    fireEvent('charge.refunded', {
      id: 'ch_1',
      payment_intent: 'pi_123',
      amount_refunded: 1000,
    });

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({ refundedAmountCents: 1000 }),
      }),
    );
  });

  it('treats an opened dispute as a full reversal', async () => {
    // Pessimistic on purpose: continuing to pay royalties out of money being
    // clawed back is the more expensive mistake.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscriptionPayment.findFirst.mockResolvedValue({
      id: 'pay-1',
      organizationId: 'org-1',
      amountPaidCents: 3900,
    });
    chargesRetrieveMock.mockResolvedValue({ id: 'ch_1', payment_intent: 'pi_123' });
    fireEvent('charge.dispute.created', { id: 'dp_1', charge: 'ch_1' });

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundedAmountCents: 3900 }),
      }),
    );
  });

  it('never deletes the payment row on reversal', async () => {
    // The payment did happen, and a pool may already have drawn on it.
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscriptionPayment.findFirst.mockResolvedValue({
      id: 'pay-1',
      organizationId: 'org-1',
      amountPaidCents: 3900,
    });
    fireEvent('charge.refunded', { id: 'ch_1', payment_intent: 'pi_123', amount_refunded: 3900 });

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.update).toHaveBeenCalled();
    expect(
      (prisma.subscriptionPayment as unknown as Record<string, unknown>).delete,
    ).toBeUndefined();
  });

  it('ignores a charge that is not a subscription payment', async () => {
    const { service, prisma } = setup();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscriptionPayment.findFirst.mockResolvedValue(null);
    fireEvent('charge.refunded', { id: 'ch_1', payment_intent: 'pi_other', amount_refunded: 500 });

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscriptionPayment.update).not.toHaveBeenCalled();
  });
});
