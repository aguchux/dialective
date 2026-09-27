import { Prisma } from '@dialectiva/db';
import { RoyaltyPoolService, allocate } from './royalty-pool.service';

/**
 * Pool computation is the step that becomes a minting decision in Phase 6.
 * These tests pin the properties that make that safe: pools fund only from
 * money actually collected, every input is frozen so no later settings change
 * can reprice a computed pool, the split balances to the cent, and a re-run
 * cannot produce a second pool for the same payment.
 *
 * Shadow mode is asserted directly -- every pool written here must carry
 * settledAt null, because a split rule that has never seen real traffic must
 * not first be computed with money attached.
 */
const MARCH = new Date('2026-03-15T12:00:00.000Z');
const MARCH_START = new Date('2026-03-01T00:00:00.000Z');

function setup(
  options: {
    royaltiesEnabled?: boolean;
    rate?: number | null;
    tokenUsdRate?: number;
    payments?: Record<string, unknown>[];
    usage?: Record<string, unknown>[];
    countries?: Record<string, unknown>[];
  } = {},
) {
  const tx = {
    royaltyPool: { create: jest.fn().mockResolvedValue({ id: 'pool-1' }) },
    royaltyAccrual: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    subscriptionPayment: { findMany: jest.fn().mockResolvedValue(options.payments ?? []) },
    recordingUsagePeriod: { groupBy: jest.fn().mockResolvedValue(options.usage ?? []) },
    country: { findMany: jest.fn().mockResolvedValue(options.countries ?? []) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const settings = {
    areRoyaltiesEnabled: jest.fn().mockResolvedValue(options.royaltiesEnabled ?? true),
    getTokenUsdRate: jest.fn().mockResolvedValue(options.tokenUsdRate ?? 0.1),
  };
  const rates = {
    rateForPeriod: jest.fn().mockResolvedValue(
      options.rate === null ? null : new Prisma.Decimal(options.rate ?? 30),
    ),
  };
  const service = new RoyaltyPoolService(
    prisma as never,
    settings as never,
    rates as never,
  );
  return { prisma, tx, settings, rates, service };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    organizationId: 'org-1',
    amountPaidCents: 3900,
    currency: 'USD',
    refundedAt: null,
    royaltyPool: null,
    ...overrides,
  };
}

function usageRow(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    contributorId: 'trainer-1',
    _sum: { streamCount: 100 },
    ...overrides,
  };
}

describe('RoyaltyPoolService: gating', () => {
  it('computes nothing when royalties are disabled', async () => {
    const { prisma, service } = setup({ royaltiesEnabled: false, payments: [payment()] });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(prisma.subscriptionPayment.findMany).not.toHaveBeenCalled();
  });

  it('refuses to compute when no rate is scheduled for the period', async () => {
    // A pool computed at an assumed rate is a silently wrong payout, so the
    // absence of a rate must stop the run rather than fall back to a default.
    const { prisma, service } = setup({ rate: null, payments: [payment()] });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('resolves the rate for the period being settled, not the current setting', async () => {
    const { rates, service } = setup();

    await service.computePeriod(MARCH);

    expect(rates.rateForPeriod).toHaveBeenCalledWith(MARCH_START);
  });

  it('refuses to compute on a non-positive token rate', async () => {
    // Dividing by zero would produce an infinite pool.
    const { prisma, service } = setup({ tokenUsdRate: 0, payments: [payment()] });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('RoyaltyPoolService: what funds a pool', () => {
  it('writes a pool from a collected payment, with every input frozen on it', async () => {
    const { tx, service } = setup({
      payments: [payment()],
      usage: [usageRow()],
    });

    const result = await service.computePeriod(MARCH);

    const pool = tx.royaltyPool.create.mock.calls[0][0].data;
    // $39.00 x 30% = $11.70, at $0.10/DL = 117 DL.
    expect(pool.collectedUsd.toString()).toBe('39');
    expect(pool.poolDl.toString()).toBe('117');
    expect(pool.sharePercentUsed.toString()).toBe('30');
    expect(pool.tokenUsdRateUsed.toString()).toBe('0.1');
    expect(pool.fxRateUsed.toString()).toBe('1');
    expect(pool.totalStreamCount).toBe(100);
    expect(result.poolsWritten).toBe(1);
  });

  it('leaves every pool unsettled -- shadow mode', async () => {
    // THE Phase 4 property. A pool with settledAt set would mean money moved.
    const { tx, service } = setup({ payments: [payment()], usage: [usageRow()] });

    const result = await service.computePeriod(MARCH);

    expect(tx.royaltyPool.create.mock.calls[0][0].data.settledAt).toBeNull();
    expect(result.shadowMode).toBe(true);
  });

  it('excludes a refunded payment', async () => {
    // Minting against money that went away is the dilution the reserve engine
    // exists to prevent.
    const { prisma, service } = setup({
      payments: [payment({ refundedAt: new Date('2026-03-20T00:00:00.000Z') })],
      usage: [usageRow()],
    });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(result.skipped.refunded).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips a payment that already has a pool, rather than repricing it', async () => {
    // A frozen pool must never be recomputed: its rate may no longer be in
    // force and its accruals may already have been paid.
    const { prisma, service } = setup({
      payments: [payment({ royaltyPool: { id: 'pool-existing' } })],
      usage: [usageRow()],
    });

    const result = await service.computePeriod(MARCH);

    expect(result.skipped.already_pooled).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes no pool when a subscriber paid but streamed nothing', async () => {
    // No denominator means nothing to divide, and no contributor has a claim.
    const { service } = setup({ payments: [payment()], usage: [] });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(result.skipped.no_usage).toBe(1);
  });

  it('selects payments whose billing window OVERLAPS the period', async () => {
    // Stripe bills on the subscriber anniversary, which rarely aligns with a
    // calendar month -- a containment test would fund almost no pools.
    const { prisma, service } = setup();

    await service.computePeriod(MARCH);

    expect(prisma.subscriptionPayment.findMany.mock.calls[0][0].where).toEqual({
      periodStart: { lt: new Date('2026-04-01T00:00:00.000Z') },
      periodEnd: { gt: MARCH_START },
    });
  });
});

describe('RoyaltyPoolService: currency conversion', () => {
  it('DIVIDES by usdExchangeRate, which is local units per USD', async () => {
    // The most expensive sign error available here: multiplying would inflate
    // an NGN pool by roughly 1,500x.
    const { tx, service } = setup({
      payments: [payment({ currency: 'NGN', amountPaidCents: 6000000 })],
      usage: [usageRow()],
      countries: [
        { currencyCode: 'NGN', usdExchangeRate: new Prisma.Decimal(1500), exchangeRateSource: 'LIVE' },
      ],
    });

    await service.computePeriod(MARCH);

    // NGN 60,000 / 1500 = $40.00, NOT $90,000,000.
    expect(tx.royaltyPool.create.mock.calls[0][0].data.collectedUsd.toString()).toBe('40');
  });

  it('records the rate it used, so the pool is recomputable forever', async () => {
    const { tx, service } = setup({
      payments: [payment({ currency: 'NGN', amountPaidCents: 6000000 })],
      usage: [usageRow()],
      countries: [
        { currencyCode: 'NGN', usdExchangeRate: new Prisma.Decimal(1500), exchangeRateSource: 'LIVE' },
      ],
    });

    await service.computePeriod(MARCH);

    expect(tx.royaltyPool.create.mock.calls[0][0].data.fxRateUsed.toString()).toBe('1500');
  });

  it('fails the pool loudly when no rate exists for the currency', async () => {
    // Never default to 1. Silently treating NGN as USD would overpay by three
    // orders of magnitude.
    const { prisma, service } = setup({
      payments: [payment({ currency: 'NGN', amountPaidCents: 6000000 })],
      usage: [usageRow()],
      countries: [],
    });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(result.skipped.no_fx_rate).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats a USD payment as 1:1 without needing a country row', async () => {
    const { tx, service } = setup({
      payments: [payment({ currency: 'usd' })],
      usage: [usageRow()],
      countries: [],
    });

    await service.computePeriod(MARCH);

    expect(tx.royaltyPool.create.mock.calls[0][0].data.collectedUsd.toString()).toBe('39');
  });
});

describe('RoyaltyPoolService: splitting', () => {
  it('splits by stream count, per subscriber', async () => {
    const { tx, service } = setup({
      payments: [payment()],
      usage: [
        usageRow({ contributorId: 'trainer-1', _sum: { streamCount: 75 } }),
        usageRow({ contributorId: 'trainer-2', _sum: { streamCount: 25 } }),
      ],
    });

    await service.computePeriod(MARCH);

    const accruals = tx.royaltyAccrual.createMany.mock.calls[0][0].data;
    const byContributor = new Map(
      accruals.map((a: { contributorId: string; amountDl: Prisma.Decimal }) => [
        a.contributorId,
        a.amountDl.toString(),
      ]),
    );
    // 117 DL split 75/25.
    expect(byContributor.get('trainer-1')).toBe('87.75');
    expect(byContributor.get('trainer-2')).toBe('29.25');
  });

  it('keeps pools separate per subscriber, so a niche dialect is not diluted', async () => {
    // A platform-wide pool would divide one subscriber heavy use of a dialect
    // against total platform usage.
    const { tx, service } = setup({
      payments: [
        payment({ id: 'pay-1', organizationId: 'org-1' }),
        payment({ id: 'pay-2', organizationId: 'org-2' }),
      ],
      usage: [
        usageRow({ organizationId: 'org-1', contributorId: 'trainer-1', _sum: { streamCount: 10 } }),
        usageRow({ organizationId: 'org-2', contributorId: 'trainer-2', _sum: { streamCount: 1000 } }),
      ],
    });

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(2);
    // Each pool is the full 117 DL: trainer-1 takes all of org-1 pool despite
    // holding 1% of platform-wide usage.
    const pools = tx.royaltyPool.create.mock.calls.map(
      (c: [{ data: { poolDl: Prisma.Decimal; totalStreamCount: number } }]) => [
        c[0].data.poolDl.toString(),
        c[0].data.totalStreamCount,
      ],
    );
    expect(pools).toEqual([
      ['117', 10],
      ['117', 1000],
    ]);
  });

  it('writes the pool and its accruals in ONE transaction', async () => {
    // A pool without its accruals is a recorded obligation with no payees.
    const { prisma, service } = setup({ payments: [payment()], usage: [usageRow()] });

    await service.computePeriod(MARCH);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('treats a unique-constraint collision as already pooled, not an error', async () => {
    // Two concurrent runs: the unique paymentId makes the loser a no-op rather
    // than a second pool.
    const { prisma, service } = setup({ payments: [payment()], usage: [usageRow()] });
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.computePeriod(MARCH);

    expect(result.poolsWritten).toBe(0);
    expect(result.skipped.already_pooled).toBe(1);
  });

  it('rethrows an error that is not a duplicate', async () => {
    // Swallowing a real database failure would silently skip a pool.
    const { prisma, service } = setup({ payments: [payment()], usage: [usageRow()] });
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));

    await expect(service.computePeriod(MARCH)).rejects.toThrow('connection lost');
  });
});

describe('RoyaltyPoolService: rounding never over-mints', () => {
  it('rounds the pool DOWN, so it never claims more DL than revenue supports', async () => {
    // Direction matters, not just precision. Rounding up would mint a
    // fraction of a DL more than the reserve inflow backing it -- small per
    // pool, and exactly the drift the reserve exists to catch. The remainder
    // rounded off here stays with the platform, which is the safe side.
    const { tx, service } = setup({
      // $10.00 at 33.33% = $3.333, / $0.07 per DL = 47.61428571428...
      payments: [payment({ amountPaidCents: 1000 })],
      usage: [usageRow()],
      rate: 33.33,
      tokenUsdRate: 0.07,
    });

    await service.computePeriod(MARCH);

    const poolDl: Prisma.Decimal = tx.royaltyPool.create.mock.calls[0][0].data.poolDl;
    const exact = new Prisma.Decimal('10')
      .times('33.33')
      .dividedBy(100)
      .dividedBy('0.07');
    expect(poolDl.lessThanOrEqualTo(exact)).toBe(true);
    expect(poolDl.toString()).toBe('47.61428571');
  });

  it('allocates that floored pool exactly, leaving nothing unaccounted', async () => {
    // The two roundings compose: poolDl is a floor, and the shares sum to that
    // floor rather than to the unrounded figure.
    const { tx, service } = setup({
      payments: [payment({ amountPaidCents: 1000 })],
      usage: [
        usageRow({ contributorId: 'a', _sum: { streamCount: 1 } }),
        usageRow({ contributorId: 'b', _sum: { streamCount: 1 } }),
        usageRow({ contributorId: 'c', _sum: { streamCount: 1 } }),
      ],
      rate: 33.33,
      tokenUsdRate: 0.07,
    });

    await service.computePeriod(MARCH);

    const poolDl: Prisma.Decimal = tx.royaltyPool.create.mock.calls[0][0].data.poolDl;
    const accruals = tx.royaltyAccrual.createMany.mock.calls[0][0].data;
    expect(sum(accruals).equals(poolDl)).toBe(true);
  });
});

describe('allocate: the split must balance exactly', () => {
  it('allocates the whole pool when it divides evenly', () => {
    const allocations = allocate(new Prisma.Decimal('100'), [
      { contributorId: 'a', streamCount: 1 },
      { contributorId: 'b', streamCount: 1 },
    ]);

    expect(sum(allocations).toString()).toBe('100');
  });

  it('allocates the whole pool when it does NOT divide evenly', () => {
    // THE invariant. Rounding each share independently would leave the total
    // short of the pool, and with money attached that means minting a different
    // amount than the reserve inflow backing it.
    const pool = new Prisma.Decimal('100');
    const allocations = allocate(pool, [
      { contributorId: 'a', streamCount: 1 },
      { contributorId: 'b', streamCount: 1 },
      { contributorId: 'c', streamCount: 1 },
    ]);

    expect(sum(allocations).equals(pool)).toBe(true);
  });

  it('gives the remainder to the largest share', () => {
    // Least distortive: a fraction of a DL against the biggest share is the
    // smallest relative change available.
    const allocations = allocate(new Prisma.Decimal('100'), [
      { contributorId: 'small', streamCount: 1 },
      { contributorId: 'big', streamCount: 2 },
    ]);

    const big = allocations.find((a) => a.contributorId === 'big');
    // 2/3 of 100 rounds down to 66.66666666; the 0.00000001 remainder lands here.
    expect(big?.amountDl.toString()).toBe('66.66666667');
    expect(sum(allocations).toString()).toBe('100');
  });

  it('breaks ties by contributorId, so a re-run reproduces the allocation', () => {
    // Determinism: without a tie-break, the remainder would follow whatever
    // order the database happened to return rows in.
    const input = [
      { contributorId: 'zeta', streamCount: 1 },
      { contributorId: 'alpha', streamCount: 1 },
      { contributorId: 'mid', streamCount: 1 },
    ];
    const first = allocate(new Prisma.Decimal('100'), input);
    const second = allocate(new Prisma.Decimal('100'), [...input].reverse());

    expect(first.map((a) => [a.contributorId, a.amountDl.toString()])).toEqual(
      second.map((a) => [a.contributorId, a.amountDl.toString()]),
    );
    // alpha wins the tie and takes the remainder.
    expect(first[0].contributorId).toBe('alpha');
  });

  it('balances across many contributors with awkward counts', () => {
    const pool = new Prisma.Decimal('117.00000001');
    const contributors = Array.from({ length: 37 }, (_, i) => ({
      contributorId: `trainer-${i}`,
      streamCount: i + 1,
    }));

    expect(sum(allocate(pool, contributors)).equals(pool)).toBe(true);
  });

  it('allocates nothing when there is no usage to divide by', () => {
    expect(allocate(new Prisma.Decimal('100'), [])).toEqual([]);
    expect(
      allocate(new Prisma.Decimal('100'), [{ contributorId: 'a', streamCount: 0 }]),
    ).toEqual([]);
  });
});

function sum(allocations: { amountDl: Prisma.Decimal }[]): Prisma.Decimal {
  return allocations.reduce((total, a) => total.plus(a.amountDl), new Prisma.Decimal(0));
}
