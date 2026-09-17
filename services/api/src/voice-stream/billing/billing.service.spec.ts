const constructEventMock = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: constructEventMock },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { cancel: jest.fn() },
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
