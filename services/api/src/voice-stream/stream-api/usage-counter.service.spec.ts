import { UsageCounterService } from './usage-counter.service';

function setup() {
  const prisma = {
    usageCounter: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const service = new UsageCounterService(prisma as never);
  return { service, prisma };
}

describe('UsageCounterService.increment', () => {
  it('upserts with the current UTC month as periodStart', async () => {
    const { service, prisma } = setup();

    await service.increment('org-1', { bytes: BigInt(500), requests: 1 });

    const call = prisma.usageCounter.upsert.mock.calls[0][0];
    expect(call.where.organizationId_periodStart.organizationId).toBe('org-1');
    expect(call.where.organizationId_periodStart.periodStart.getUTCDate()).toBe(1);
    expect(call.create).toEqual(
      expect.objectContaining({ organizationId: 'org-1', bytesUsed: BigInt(500), requestsUsed: 1 }),
    );
    expect(call.update).toEqual({
      bytesUsed: { increment: BigInt(500) },
      requestsUsed: { increment: 1 },
    });
  });

  it('never throws when the write fails', async () => {
    const { service, prisma } = setup();
    prisma.usageCounter.upsert.mockRejectedValue(new Error('db down'));

    await expect(service.increment('org-1', { requests: 1 })).resolves.toBeUndefined();
  });
});

describe('UsageCounterService.getCurrentUsage', () => {
  it('returns zeroed usage when no row exists yet for the current period', async () => {
    const { service } = setup();

    const usage = await service.getCurrentUsage('org-1');

    expect(usage.bytesUsed).toBe(BigInt(0));
    expect(usage.requestsUsed).toBe(0);
  });

  it('returns the existing row when one exists', async () => {
    const { service, prisma } = setup();
    prisma.usageCounter.findUnique.mockResolvedValue({
      periodStart: new Date('2026-08-01'),
      bytesUsed: BigInt(2000),
      requestsUsed: 42,
    });

    const usage = await service.getCurrentUsage('org-1');

    expect(usage.bytesUsed).toBe(BigInt(2000));
    expect(usage.requestsUsed).toBe(42);
  });
});
