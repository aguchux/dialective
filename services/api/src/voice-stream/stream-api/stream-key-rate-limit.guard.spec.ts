import { HttpException } from '@nestjs/common';

const mockRedisInstance = {
  incr: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn(),
};

// Never let the guard construct a real ioredis client -- it eagerly connects
// on instantiation, and a real TCP attempt against `redis:6379` in a unit
// test environment hangs the test runner. Same mocking approach as
// dedicated-capacity.guard.spec.ts.
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

import { StreamKeyRateLimitGuard } from './stream-key-rate-limit.guard';

function ctxWith(streamKey: { id: string; organizationId: string }, ip = '1.2.3.4') {
  const request: any = { streamKey, ip };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function setup() {
  const prisma: any = { subscription: { findUnique: jest.fn() } };
  Object.values(mockRedisInstance).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as jest.Mock).mockReset();
  });
  const guard = new StreamKeyRateLimitGuard(prisma as never);
  return { guard, prisma, redis: mockRedisInstance };
}

describe('StreamKeyRateLimitGuard', () => {
  it('allows the request when under the plan-specific limit', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: 10 } });
    redis.incr.mockResolvedValue(5);

    const result = await guard.canActivate(ctxWith({ id: 'key-1', organizationId: 'org-1' }));

    expect(result).toBe(true);
  });

  it('rejects with 429 once the count exceeds the plan-specific limit', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: 10 } });
    redis.incr.mockResolvedValue(11);

    await expect(
      guard.canActivate(ctxWith({ id: 'key-1', organizationId: 'org-1' })),
    ).rejects.toThrow(HttpException);
  });

  it('falls back to the default limit when the plan has no rateLimitPerMinute set', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: null } });
    redis.incr.mockResolvedValue(1000);

    await expect(
      guard.canActivate(ctxWith({ id: 'key-1', organizationId: 'org-1' })),
    ).rejects.toThrow(HttpException);
  });

  it('sets an expiry only on the first request of a window (count === 1)', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: 10 } });
    redis.incr.mockResolvedValue(1);

    await guard.canActivate(ctxWith({ id: 'key-1', organizationId: 'org-1' }));

    expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('stream-key-rate-limit:key-1:'), 65);
  });

  it('does not re-set the expiry on subsequent requests in the same window', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: 10 } });
    redis.incr.mockResolvedValue(2);

    await guard.canActivate(ctxWith({ id: 'key-1', organizationId: 'org-1' }));

    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('keys the counter by Stream Key id, not IP, so different keys get independent buckets', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: 10 } });
    redis.incr.mockResolvedValue(1);

    await guard.canActivate(ctxWith({ id: 'key-abc', organizationId: 'org-1' }, '9.9.9.9'));

    expect(redis.incr).toHaveBeenCalledWith(expect.stringContaining('stream-key-rate-limit:key-abc:'));
  });

  it('fails open when Redis errors', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { rateLimitPerMinute: 10 } });
    redis.incr.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await guard.canActivate(ctxWith({ id: 'key-1', organizationId: 'org-1' }));

    expect(result).toBe(true);
  });
});
