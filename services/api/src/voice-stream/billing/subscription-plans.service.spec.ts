import { BadRequestException } from '@nestjs/common';
import { SubscriptionPlansService } from './subscription-plans.service';

function setup() {
  const prisma = {
    subscriptionPlan: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    subscription: { findFirst: jest.fn() },
  };
  const service = new SubscriptionPlansService(prisma as never);
  return { service, prisma };
}

describe('SubscriptionPlansService.upsert', () => {
  it('rejects a blank key', async () => {
    const { service } = setup();
    await expect(
      service.upsert({ key: '  ', name: 'Starter', stripePriceId: 'price_1', monthlyUsdAmount: 10 }),
    ).rejects.toThrow('key is required');
  });

  it('rejects a blank stripePriceId', async () => {
    const { service } = setup();
    await expect(
      service.upsert({ key: 'starter', name: 'Starter', stripePriceId: '  ', monthlyUsdAmount: 10 }),
    ).rejects.toThrow('stripePriceId is required');
  });

  it('rejects a stripePriceId already used by a different plan', async () => {
    const { service, prisma } = setup();
    prisma.subscriptionPlan.findFirst.mockResolvedValue({ key: 'professional' });

    await expect(
      service.upsert({
        key: 'starter',
        name: 'Starter',
        stripePriceId: 'price_shared',
        monthlyUsdAmount: 10,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts by key with trimmed name/priceId', async () => {
    const { service, prisma } = setup();
    prisma.subscriptionPlan.findFirst.mockResolvedValue(null);
    prisma.subscriptionPlan.upsert.mockResolvedValue({ key: 'starter' });

    await service.upsert({
      key: 'starter',
      name: '  Starter  ',
      stripePriceId: '  price_1  ',
      monthlyUsdAmount: 49,
      maxStreamDecks: 5,
      active: true,
    });

    expect(prisma.subscriptionPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'starter' },
        create: expect.objectContaining({
          key: 'starter',
          name: 'Starter',
          stripePriceId: 'price_1',
          monthlyUsdAmount: 49,
          maxStreamDecks: 5,
          maxTeamMembers: null,
          active: true,
        }),
      }),
    );
  });

  it('stringifies the BigInt monthlyByteQuota in the returned row (JSON.stringify cannot serialize a raw bigint)', async () => {
    const { service, prisma } = setup();
    prisma.subscriptionPlan.findFirst.mockResolvedValue(null);
    prisma.subscriptionPlan.upsert.mockResolvedValue({ key: 'starter', monthlyByteQuota: BigInt(500_000_000) });

    const result = await service.upsert({
      key: 'starter',
      name: 'Starter',
      stripePriceId: 'price_1',
      monthlyUsdAmount: 49,
      monthlyByteQuota: BigInt(500_000_000),
    });

    expect(result.monthlyByteQuota).toBe('500000000');
  });
});

describe('SubscriptionPlansService.list', () => {
  it('stringifies each plan row\'s BigInt monthlyByteQuota', async () => {
    const { service, prisma } = setup();
    prisma.subscriptionPlan.findMany.mockResolvedValue([
      { key: 'starter', monthlyByteQuota: null },
      { key: 'enterprise', monthlyByteQuota: BigInt(1_000_000_000) },
    ]);

    const result = await service.list();

    expect(result[0].monthlyByteQuota).toBeNull();
    expect(result[1].monthlyByteQuota).toBe('1000000000');
  });
});

describe('SubscriptionPlansService.remove', () => {
  it('rejects deleting a plan with active subscriptions', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub-1' });

    await expect(service.remove('starter')).rejects.toThrow(BadRequestException);
    expect(prisma.subscriptionPlan.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a plan with no active subscriptions', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findFirst.mockResolvedValue(null);

    await service.remove('starter');

    expect(prisma.subscriptionPlan.deleteMany).toHaveBeenCalledWith({ where: { key: 'starter' } });
  });
});
