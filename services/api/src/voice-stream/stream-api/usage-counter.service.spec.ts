import { UsageCounterService } from './usage-counter.service';

function setup() {
  const prisma = {
    usageCounter: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ requestsUsed: 1 }]),
  };
  const service = new UsageCounterService(prisma as never);
  return { service, prisma };
}

describe('UsageCounterService.increment', () => {
  it('upserts bytes with the current UTC month as periodStart', async () => {
    const { service, prisma } = setup();

    await service.increment('org-1', { bytes: BigInt(500) });

    const call = prisma.usageCounter.upsert.mock.calls[0][0];
    expect(call.where.organizationId_periodStart.organizationId).toBe('org-1');
    expect(call.where.organizationId_periodStart.periodStart.getUTCDate()).toBe(1);
    expect(call.create).toEqual(
      expect.objectContaining({ organizationId: 'org-1', bytesUsed: BigInt(500), requestsUsed: 0 }),
    );
    expect(call.update).toEqual({
      bytesUsed: { increment: BigInt(500) },
    });
  });

  it('never throws when the write fails', async () => {
    const { service, prisma } = setup();
    prisma.usageCounter.upsert.mockRejectedValue(new Error('db down'));

    await expect(service.increment('org-1', { bytes: BigInt(1) })).resolves.toBeUndefined();
  });

  it('is a no-op (does not touch the DB) when bytes is not provided -- requestsUsed is tracked exclusively via tryReserveRequest', async () => {
    const { service, prisma } = setup();

    await service.increment('org-1', {});

    expect(prisma.usageCounter.upsert).not.toHaveBeenCalled();
  });
});

describe('UsageCounterService.tryReserveRequest', () => {
  it('reports withinQuota true when the atomically-incremented count is still <= quota', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ requestsUsed: 5 }]);

    const result = await service.tryReserveRequest('org-1', 10);

    expect(result).toEqual({ withinQuota: true });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reports withinQuota false once the atomically-incremented count exceeds quota', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ requestsUsed: 11 }]);

    const result = await service.tryReserveRequest('org-1', 10);

    expect(result).toEqual({ withinQuota: false });
  });

  it('still performs the increment (accounting stays accurate) even when denying the request', async () => {
    const { service, prisma } = setup();
    const queryRaw = jest.fn().mockResolvedValue([{ requestsUsed: 11 }]);
    prisma.$queryRaw = queryRaw;

    await service.tryReserveRequest('org-1', 10);

    expect(queryRaw).toHaveBeenCalledTimes(1);
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
