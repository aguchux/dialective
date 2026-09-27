import { Prisma } from '@dialectiva/db';
import { RoyaltySettlementService } from './royalty-settlement.service';

/**
 * The only code in this engine that moves money. These tests pin what makes
 * that defensible: every gate refuses the WHOLE run before anything moves, the
 * pool is claimed before any write, credits land in royaltyBalance and never in
 * balance, and nothing is minted while Stripe cannot reach the coverage
 * numerator.
 */
const MARCH_START = new Date('2026-03-01T00:00:00.000Z');

function pool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-1',
    organizationId: 'org-1',
    collectedUsd: new Prisma.Decimal('39'),
    poolDl: new Prisma.Decimal('117'),
    accruals: [{ contributorId: 'trainer-1', amountDl: new Prisma.Decimal('117') }],
    ...overrides,
  };
}

function setup(
  options: {
    royaltiesEnabled?: boolean;
    shadowMode?: boolean;
    mintingPaused?: boolean;
    runCap?: number;
    pools?: Record<string, unknown>[];
    claimCount?: number;
  } = {},
) {
  const tx = {
    royaltyPool: {
      updateMany: jest.fn().mockResolvedValue({ count: options.claimCount ?? 1 }),
    },
    reserveAccount: { upsert: jest.fn().mockResolvedValue({ id: 'reserve-1' }) },
    reserveTransaction: { upsert: jest.fn().mockResolvedValue({}) },
    wallet: {
      upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    tokenOperation: { upsert: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    tokenLedgerEntry: { create: jest.fn().mockResolvedValue({}) },
    tokenAccount: { upsert: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    royaltyPool: { findMany: jest.fn().mockResolvedValue(options.pools ?? []) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const settings = {
    areRoyaltiesEnabled: jest.fn().mockResolvedValue(options.royaltiesEnabled ?? true),
    isRoyaltyShadowMode: jest.fn().mockResolvedValue(options.shadowMode ?? false),
    getRoyaltyMaxRunAccrualDl: jest.fn().mockResolvedValue(options.runCap ?? 100000),
  };
  const tokenomics = {
    isMintingPaused: jest.fn().mockResolvedValue(options.mintingPaused ?? false),
  };
  const service = new RoyaltySettlementService(
    prisma as never,
    settings as never,
    tokenomics as never,
  );
  return { prisma, tx, settings, tokenomics, service };
}

describe('RoyaltySettlementService: gates refuse the whole run', () => {
  it('settles nothing when royalties are disabled', async () => {
    const { prisma, service } = setup({ royaltiesEnabled: false, pools: [pool()] });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.abortedBecause).toBe('royalties_disabled');
    expect(result.poolsSettled).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('settles nothing while shadow mode is on', async () => {
    // The entire point of Phase 4. Pools exist and pay nobody until an admin
    // deliberately leaves shadow mode.
    const { prisma, service } = setup({ shadowMode: true, pools: [pool()] });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.abortedBecause).toBe('shadow_mode');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('honours mintingPaused, the platform-wide kill switch', async () => {
    // Royalty DL is real issued DL. A kill switch that some credit paths ignore
    // is not a kill switch.
    const { prisma, service } = setup({ mintingPaused: true, pools: [pool()] });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.abortedBecause).toBe('minting_paused');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses the entire run when its total exceeds the cap', async () => {
    // Blast radius. A wrong FX rate scales every pool in the run at once and
    // still looks like a valid run.
    const { prisma, service } = setup({
      runCap: 100,
      pools: [pool({ id: 'p1' }), pool({ id: 'p2' })],
    });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.abortedBecause).toBe('run_cap_exceeded');
    expect(result.poolsSettled).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks the cap across the run, not per pool', async () => {
    // Two pools of 117 DL each pass a per-pool check of 200 and must still fail
    // a run cap of 200.
    const { service } = setup({
      runCap: 200,
      pools: [pool({ id: 'p1' }), pool({ id: 'p2' })],
    });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.abortedBecause).toBe('run_cap_exceeded');
  });

  it('settles a run that sits exactly on the cap', async () => {
    // Boundary: the cap is a ceiling, not an exclusive bound.
    const { service } = setup({ runCap: 117, pools: [pool()] });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.abortedBecause).toBeUndefined();
    expect(result.poolsSettled).toBe(1);
  });

  it('aborts before moving anything, so a run never half-settles', async () => {
    // Half-settled is strictly worse than not settled: the half that moved
    // cannot be un-moved.
    const { tx, service } = setup({ runCap: 1, pools: [pool()] });

    await service.settlePeriod(MARCH_START);

    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.reserveTransaction.upsert).not.toHaveBeenCalled();
  });
});

describe('RoyaltySettlementService: the money path', () => {
  it('claims the pool before writing anything', async () => {
    const { tx, service } = setup({ pools: [pool()] });

    await service.settlePeriod(MARCH_START);

    expect(tx.royaltyPool.updateMany).toHaveBeenCalledWith({
      where: { id: 'pool-1', settledAt: null },
      data: { settledAt: expect.any(Date) },
    });
  });

  it('writes nothing when the claim loses a race', async () => {
    // count === 0 means a concurrent run already settled it. The whole
    // idempotency story.
    const { tx, service } = setup({ pools: [pool()], claimCount: 0 });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.poolsSettled).toBe(0);
    expect(result.alreadySettled).toBe(1);
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('credits royaltyBalance and never balance', async () => {
    // The separation Phase 5 exists to create. Crediting balance here would make
    // royalty DL stakeable and P2P-tradeable.
    const { tx, service } = setup({ pools: [pool()] });

    await service.settlePeriod(MARCH_START);

    const update = tx.wallet.update.mock.calls[0][0];
    expect(update.data).toEqual({ royaltyBalance: { increment: new Prisma.Decimal('117') } });
    expect(JSON.stringify(update.data)).not.toContain('"balance"');
  });

  it('writes a ROYALTY_ACCRUAL ledger row referencing the pool', async () => {
    const { tx, service } = setup({ pools: [pool()] });

    await service.settlePeriod(MARCH_START);

    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toEqual({
      walletId: 'wallet-1',
      type: 'ROYALTY_ACCRUAL',
      amount: new Prisma.Decimal('117'),
      reference: 'pool-1',
    });
  });

  it('records the collected revenue as a BUSINESS_REVENUE reserve inflow', async () => {
    const { tx, service } = setup({ pools: [pool()] });

    await service.settlePeriod(MARCH_START);

    const data = tx.reserveTransaction.upsert.mock.calls[0][0].create;
    expect(data.type).toBe('BUSINESS_REVENUE');
    expect(data.direction).toBe('CREDIT');
    expect(data.amount.toString()).toBe('39');
    expect(tx.reserveTransaction.upsert.mock.calls[0][0].where).toEqual({
      idempotencyKey: 'royalty-pool:pool-1',
    });
  });

  it('does NOT mint, because Stripe cannot reach the coverage numerator', async () => {
    // Reviewed departure from 5.3. eligibleReserveUsd sums only POLLED provider
    // balances (Flutterwave, NOWPayments); Stripe is not polled. Minting would
    // raise `redeemable` while its backing stayed invisible to the numerator --
    // coverage falling on every settlement, which is exactly the dilution the
    // reserve engine exists to prevent. The inflow is still recorded.
    const { tx, service } = setup({ pools: [pool()] });

    await service.settlePeriod(MARCH_START);

    expect(tx.tokenOperation.upsert).not.toHaveBeenCalled();
    expect(tx.tokenLedgerEntry.create).not.toHaveBeenCalled();
    expect(tx.reserveTransaction.upsert).toHaveBeenCalledTimes(1);
  });

  it('settles each pool in its own transaction', async () => {
    // One failing pool must not roll back pools that already succeeded.
    const { prisma, service } = setup({
      pools: [pool({ id: 'p1' }), pool({ id: 'p2' })],
      runCap: 1000,
    });

    await service.settlePeriod(MARCH_START);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('credits every contributor in a pool', async () => {
    const { tx, service } = setup({
      pools: [
        pool({
          accruals: [
            { contributorId: 'a', amountDl: new Prisma.Decimal('70') },
            { contributorId: 'b', amountDl: new Prisma.Decimal('47') },
          ],
        }),
      ],
    });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.contributorsCredited).toBe(2);
    expect(tx.wallet.update).toHaveBeenCalledTimes(2);
  });

  it('skips a zero-amount accrual rather than writing an empty ledger row', async () => {
    const { tx, service } = setup({
      pools: [
        pool({
          accruals: [
            { contributorId: 'a', amountDl: new Prisma.Decimal('117') },
            { contributorId: 'b', amountDl: new Prisma.Decimal('0') },
          ],
        }),
      ],
    });

    await service.settlePeriod(MARCH_START);

    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it('ignores a pool with no accruals, rather than stamping it settled', async () => {
    // A pool with no payee means the split produced nothing. Marking it settled
    // would hide a computation bug behind a successful-looking run.
    const { prisma, service } = setup({ pools: [pool({ accruals: [] })] });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.poolsSettled).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports the total accrued', async () => {
    const { service } = setup({
      pools: [pool({ id: 'p1' }), pool({ id: 'p2' })],
      runCap: 1000,
    });

    const result = await service.settlePeriod(MARCH_START);

    expect(result.totalAccruedDl).toBe('234');
  });

  it('selects only unsettled pools for the period', async () => {
    const { prisma, service } = setup();

    await service.settlePeriod(MARCH_START);

    expect(prisma.royaltyPool.findMany.mock.calls[0][0].where).toEqual({
      periodStart: MARCH_START,
      settledAt: null,
    });
  });
});
