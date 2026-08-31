import { HttpException } from '@nestjs/common';

// FLEET_MAX_CONCURRENT_STREAMS/FLEET_MAX_REQUESTS_PER_MINUTE are read into
// module-level constants at import time (dedicated-capacity.guard.ts), so
// they must be set BEFORE the module is first required below -- setting
// them in beforeEach() would be too late, since require() is cached and
// only evaluates the module once per test file.
process.env.FLEET_MAX_CONCURRENT_STREAMS = '10';
process.env.FLEET_MAX_REQUESTS_PER_MINUTE = '100';

const mockRedisInstance = {
  get: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  multi: jest.fn(),
  quit: jest.fn(),
};

// Never let the guard construct a real ioredis client -- it eagerly connects
// on instantiation, and a real TCP attempt against `redis:6379` in a unit
// test environment hangs the test runner. This mock hands back the same
// jest.fn()-backed instance every time `new Redis(...)` is called.
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DedicatedCapacityGuard } = require('./dedicated-capacity.guard');

function ctxWith(streamKey: { organizationId: string; isReservedCapacityOrg?: boolean }) {
  const request: any = { streamKey: { ...streamKey } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    request,
  } as any;
}

function multiChain() {
  const ops: Array<{ op: string; args: unknown[] }> = [];
  const chain: any = {
    incr: (...args: unknown[]) => {
      ops.push({ op: 'incr', args });
      return chain;
    },
    expire: (...args: unknown[]) => {
      ops.push({ op: 'expire', args });
      return chain;
    },
    exec: jest.fn().mockResolvedValue([]),
  };
  return { chain, ops };
}

function setup() {
  const prisma: any = { subscription: { findUnique: jest.fn() } };
  Object.values(mockRedisInstance).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as jest.Mock).mockReset();
  });
  const guard = new DedicatedCapacityGuard(prisma as never);
  return { guard, prisma, redis: mockRedisInstance };
}

describe('DedicatedCapacityGuard.canActivate', () => {
  it('is a complete no-op when unconfigured (env vars 0/unset)', async () => {
    const originalConcurrent = process.env.FLEET_MAX_CONCURRENT_STREAMS;
    const originalRate = process.env.FLEET_MAX_REQUESTS_PER_MINUTE;
    delete process.env.FLEET_MAX_CONCURRENT_STREAMS;
    delete process.env.FLEET_MAX_REQUESTS_PER_MINUTE;

    // Fresh module instance, re-evaluated with the env vars now unset --
    // the shared top-of-file `require` (used by every other test in this
    // file) was already evaluated with them set to 10/100 and is cached.
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DedicatedCapacityGuard: UnconfiguredGuard } = require('./dedicated-capacity.guard');
    const prisma: any = { subscription: { findUnique: jest.fn() } };
    const guard = new UnconfiguredGuard(prisma as never);
    const ctx = ctxWith({ organizationId: 'org-1' });

    const result = await guard.canActivate(ctx);

    process.env.FLEET_MAX_CONCURRENT_STREAMS = originalConcurrent;
    process.env.FLEET_MAX_REQUESTS_PER_MINUTE = originalRate;

    expect(result).toBe(true);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });
});

describe('DedicatedCapacityGuard.canActivate (configured)', () => {
  beforeEach(() => {
    process.env.FLEET_MAX_CONCURRENT_STREAMS = '10';
    process.env.FLEET_MAX_REQUESTS_PER_MINUTE = '100';
  });

  it('always allows an Enterprise org (reservedCapacityPercent set) without checking the floor', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: 20 } });
    const ctx = ctxWith({ organizationId: 'org-1' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(redis.get).not.toHaveBeenCalled();
    expect(ctx.request.streamKey.isReservedCapacityOrg).toBe(true);
  });

  it('allows a non-Enterprise org when the fleet is under ceiling', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: null } });
    redis.get.mockResolvedValue('2');
    const ctx = ctxWith({ organizationId: 'org-2' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('allows a non-Enterprise org at the concurrency ceiling when no Enterprise org is live (enterpriseConcurrent === 0)', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: null } });
    redis.get.mockImplementation((key: string) => {
      if (key === 'dedicated-capacity:concurrent:total') return Promise.resolve('10');
      if (key === 'dedicated-capacity:concurrent:enterprise') return Promise.resolve('0');
      return Promise.resolve('0');
    });
    const ctx = ctxWith({ organizationId: 'org-2' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('blocks a non-Enterprise org at the concurrency ceiling when an Enterprise org is actively using its floor', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: null } });
    redis.get.mockImplementation((key: string) => {
      if (key === 'dedicated-capacity:concurrent:total') return Promise.resolve('10');
      if (key === 'dedicated-capacity:concurrent:enterprise') return Promise.resolve('1');
      return Promise.resolve('0');
    });
    const ctx = ctxWith({ organizationId: 'org-2' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('allows a non-Enterprise org at the rate ceiling when no Enterprise org is live (enterpriseReqRate === 0)', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: null } });
    redis.get.mockImplementation((key: string) => {
      if (key.startsWith('dedicated-capacity:reqrate:') && !key.includes('enterprise')) {
        return Promise.resolve('100');
      }
      return Promise.resolve('0');
    });
    const ctx = ctxWith({ organizationId: 'org-2' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('blocks a non-Enterprise org at the rate ceiling when an Enterprise org is actively consuming rate headroom', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: null } });
    redis.get.mockImplementation((key: string) => {
      if (key.startsWith('dedicated-capacity:reqrate:enterprise:')) return Promise.resolve('5');
      if (key.startsWith('dedicated-capacity:reqrate:')) return Promise.resolve('100');
      return Promise.resolve('0');
    });
    const ctx = ctxWith({ organizationId: 'org-2' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('fails open when Redis errors', async () => {
    const { guard, prisma, redis } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { reservedCapacityPercent: null } });
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const ctx = ctxWith({ organizationId: 'org-2' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });
});

describe('DedicatedCapacityGuard.trackStart / trackEnd', () => {
  it('increments total and enterprise counters when isReserved', async () => {
    const { guard, redis } = setup();
    const { chain, ops } = multiChain();
    redis.multi.mockReturnValue(chain);

    await guard.trackStart(true);

    expect(redis.incr).toHaveBeenCalledWith('dedicated-capacity:concurrent:total');
    expect(redis.incr).toHaveBeenCalledWith('dedicated-capacity:concurrent:enterprise');
    expect(ops.some((o) => o.op === 'incr' && String(o.args[0]).includes('enterprise'))).toBe(true);
  });

  it('increments only the total counter when not reserved', async () => {
    const { guard, redis } = setup();
    const { chain } = multiChain();
    redis.multi.mockReturnValue(chain);

    await guard.trackStart(false);

    expect(redis.incr).toHaveBeenCalledWith('dedicated-capacity:concurrent:total');
    expect(redis.incr).not.toHaveBeenCalledWith('dedicated-capacity:concurrent:enterprise');
  });

  it('trackStart never throws even if Redis errors', async () => {
    const { guard, redis } = setup();
    redis.incr.mockRejectedValue(new Error('down'));

    await expect(guard.trackStart(true)).resolves.toBeUndefined();
  });

  it('trackEnd decrements counters and never throws on error', async () => {
    const { guard, redis } = setup();

    await guard.trackEnd(true);
    expect(redis.decr).toHaveBeenCalledWith('dedicated-capacity:concurrent:total');
    expect(redis.decr).toHaveBeenCalledWith('dedicated-capacity:concurrent:enterprise');

    redis.decr.mockRejectedValue(new Error('down'));
    await expect(guard.trackEnd(false)).resolves.toBeUndefined();
  });
});
