import { HttpException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { QuotaGuard } from './quota.guard';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

function setup() {
  const prisma = { subscription: { findUnique: jest.fn() } };
  const usageCounter = { getCurrentUsage: jest.fn() };
  const guard = new QuotaGuard(prisma as never, usageCounter as never);
  return { guard, prisma, usageCounter };
}

function contextWith(streamKey: AuthenticatedStreamKeyRequest['streamKey']): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ streamKey }) }),
  } as unknown as ExecutionContext;
}

const streamKey = {
  id: 'key-1',
  organizationId: 'org-1',
  deckId: null,
  scopes: [],
  credentialType: 'stream_key' as const,
};

describe('QuotaGuard', () => {
  it('allows the request when the plan has no quota fields set (both null)', async () => {
    const { guard, prisma, usageCounter } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { monthlyByteQuota: null, monthlyRequestQuota: null },
    });

    const result = await guard.canActivate(contextWith(streamKey));

    expect(result).toBe(true);
    expect(usageCounter.getCurrentUsage).not.toHaveBeenCalled();
  });

  it('allows the request when usage is under both quotas', async () => {
    const { guard, prisma, usageCounter } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { monthlyByteQuota: BigInt(1_000_000), monthlyRequestQuota: 1000 },
    });
    usageCounter.getCurrentUsage.mockResolvedValue({
      periodStart: new Date('2026-08-01'),
      bytesUsed: BigInt(500),
      requestsUsed: 10,
    });

    const result = await guard.canActivate(contextWith(streamKey));

    expect(result).toBe(true);
  });

  it('rejects with 429 when the request quota is exhausted', async () => {
    const { guard, prisma, usageCounter } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { monthlyByteQuota: null, monthlyRequestQuota: 100 },
    });
    usageCounter.getCurrentUsage.mockResolvedValue({
      periodStart: new Date('2026-08-01'),
      bytesUsed: BigInt(0),
      requestsUsed: 100,
    });

    await expect(guard.canActivate(contextWith(streamKey))).rejects.toThrow(HttpException);
  });

  it('rejects with 429 when the byte quota is exhausted', async () => {
    const { guard, prisma, usageCounter } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { monthlyByteQuota: BigInt(1000), monthlyRequestQuota: null },
    });
    usageCounter.getCurrentUsage.mockResolvedValue({
      periodStart: new Date('2026-08-01'),
      bytesUsed: BigInt(1000),
      requestsUsed: 5,
    });

    await expect(guard.canActivate(contextWith(streamKey))).rejects.toThrow(HttpException);
  });
});
