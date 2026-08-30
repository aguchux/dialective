process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_dummy';

const constructEventMock = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: constructEventMock },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
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
    },
    subscriberOrganization: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  };
  const service = new BillingService(prisma as any);
  return { prisma, service };
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
