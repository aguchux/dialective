import { Prisma } from '@dialectiva/db';
import { RoyaltyRecoveryService } from './royalty-recovery.service';

/**
 * Chargeback recovery. Section 5.5 names three things that must NOT happen, and
 * each is a test here: no negative balance, no debt carried forward, and no
 * reaching into Wallet.balance. The platform absorbs the shortfall because the
 * contributor did nothing wrong -- a party they cannot see and never transacted
 * with reversed a payment.
 */
function pool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-1',
    collectedUsd: new Prisma.Decimal('39'),
    accruals: [{ contributorId: 'trainer-1', amountDl: new Prisma.Decimal('100') }],
    ...overrides,
  };
}

function setup(
  options: {
    pools?: Record<string, unknown>[];
    alreadyReversed?: string[];
    walletsByUser?: Record<string, { id: string; royaltyBalance: string } | null>;
    debitCount?: number;
  } = {},
) {
  const wallets = options.walletsByUser ?? {
    'trainer-1': { id: 'wallet-1', royaltyBalance: '100' },
  };
  const tx = {
    wallet: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        const found = wallets[where.userId];
        return found
          ? { id: found.id, royaltyBalance: new Prisma.Decimal(found.royaltyBalance) }
          : null;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: options.debitCount ?? 1 }),
    },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    reserveAccount: { upsert: jest.fn().mockResolvedValue({ id: 'reserve-1' }) },
    reserveTransaction: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    royaltyPool: { findMany: jest.fn().mockResolvedValue(options.pools ?? [pool()]) },
    reserveTransaction: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.alreadyReversed ?? []).map((id) => ({ sourceReference: id })),
        ),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const service = new RoyaltyRecoveryService(prisma as never);
  return { prisma, tx, service };
}

describe('RoyaltyRecoveryService: recovery stops at zero', () => {
  it('recovers the full amount when the contributor still holds it', async () => {
    const { tx, service } = setup();

    const result = await service.recoverReversedPayments();

    expect(result.recoveredDl).toBe('100');
    expect(result.shortfallDl).toBe('0');
    expect(tx.wallet.updateMany.mock.calls[0][0].data).toEqual({
      royaltyBalance: { decrement: new Prisma.Decimal('100') },
    });
  });

  it('never drives a balance negative -- takes what is there and absorbs the rest', async () => {
    // 5.5's first rule. A contributor's dashboard must never show a debt they
    // had no part in creating.
    const { tx, service } = setup({
      walletsByUser: { 'trainer-1': { id: 'wallet-1', royaltyBalance: '30' } },
    });

    const result = await service.recoverReversedPayments();

    expect(result.recoveredDl).toBe('30');
    expect(result.shortfallDl).toBe('70');
    expect(tx.wallet.updateMany.mock.calls[0][0].data).toEqual({
      royaltyBalance: { decrement: new Prisma.Decimal('30') },
    });
  });

  it('absorbs the whole amount when it was already withdrawn in full', async () => {
    const { tx, service } = setup({
      walletsByUser: { 'trainer-1': { id: 'wallet-1', royaltyBalance: '0' } },
    });

    const result = await service.recoverReversedPayments();

    expect(result.recoveredDl).toBe('0');
    expect(result.shortfallDl).toBe('100');
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('writes no ledger row when nothing could be recovered', async () => {
    // A zero-amount entry would assert money moved when none did, and the
    // ledger is the source of truth for exactly that.
    const { tx, service } = setup({
      walletsByUser: { 'trainer-1': { id: 'wallet-1', royaltyBalance: '0' } },
    });

    await service.recoverReversedPayments();

    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('never carries a debt forward', async () => {
    // 5.5's second rule. The shortfall is written off, not deducted from future
    // royalties -- otherwise a contributor's next months silently disappear
    // paying off a stranger's chargeback.
    const { tx, service } = setup({
      walletsByUser: { 'trainer-1': { id: 'wallet-1', royaltyBalance: '30' } },
    });

    await service.recoverReversedPayments();

    // Exactly one debit, for what was available. Nothing scheduled, nothing
    // negative persisted anywhere.
    expect(tx.wallet.updateMany).toHaveBeenCalledTimes(1);
    const entries = tx.ledgerEntry.create.mock.calls.map((c) => c[0].data.amount.toString());
    expect(entries).toEqual(['-30']);
  });

  it('never reaches into Wallet.balance', async () => {
    // 5.5's third rule. Recovery never touches DL earned by contributing --
    // the separation holds in BOTH directions.
    const { tx, service } = setup();

    await service.recoverReversedPayments();

    const debit = JSON.stringify(tx.wallet.updateMany.mock.calls[0][0]);
    expect(debit).toContain('royaltyBalance');
    expect(debit).not.toContain('"balance"');
    expect(debit).not.toContain('lockedBalance');
  });

  it('guards the debit atomically, so a concurrent withdrawal cannot go negative', async () => {
    const { tx, service } = setup();

    await service.recoverReversedPayments();

    expect(tx.wallet.updateMany.mock.calls[0][0].where).toEqual({
      id: 'wallet-1',
      royaltyBalance: { gte: new Prisma.Decimal('100') },
    });
  });

  it('absorbs the amount when a concurrent withdrawal wins the race', async () => {
    // The guard matched nothing: the balance was drained between the read and
    // the debit. Nothing recovered, whole amount absorbed, no ledger row.
    const { tx, service } = setup({ debitCount: 0 });

    const result = await service.recoverReversedPayments();

    expect(result.recoveredDl).toBe('0');
    expect(result.shortfallDl).toBe('100');
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('absorbs the amount when the contributor has no wallet at all', async () => {
    const { service } = setup({ walletsByUser: {} });

    const result = await service.recoverReversedPayments();

    expect(result.shortfallDl).toBe('100');
  });
});

describe('RoyaltyRecoveryService: the reserve', () => {
  it('reverses the reserve for the FULL amount, not just what was recovered', async () => {
    // Reversing only the recovered part would leave DL outstanding against
    // revenue that went away -- the dilution the reserve exists to prevent. The
    // shortfall is a platform loss recorded honestly, not an accounting gap.
    const { tx, service } = setup({
      walletsByUser: { 'trainer-1': { id: 'wallet-1', royaltyBalance: '0' } },
    });

    const result = await service.recoverReversedPayments();

    expect(result.recoveredDl).toBe('0');
    const reversal = tx.reserveTransaction.upsert.mock.calls[0][0].create;
    expect(reversal.amount.toString()).toBe('39');
    expect(reversal.type).toBe('REVERSAL');
    expect(reversal.direction).toBe('DEBIT');
  });

  it('keys the reversal per pool, so a re-run cannot double-debit', async () => {
    const { tx, service } = setup();

    await service.recoverReversedPayments();

    expect(tx.reserveTransaction.upsert.mock.calls[0][0].where).toEqual({
      idempotencyKey: 'royalty-pool-reversal:pool-1',
    });
  });
});

describe('RoyaltyRecoveryService: selection', () => {
  it('selects only settled pools whose payment was refunded', async () => {
    const { prisma, service } = setup();

    await service.recoverReversedPayments();

    expect(prisma.royaltyPool.findMany.mock.calls[0][0].where).toEqual({
      settledAt: { not: null },
      payment: { refundedAt: { not: null } },
    });
  });

  it('skips a pool already reversed', async () => {
    const { prisma, service } = setup({ alreadyReversed: ['pool-1'] });

    const result = await service.recoverReversedPayments();

    expect(result.poolsReversed).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('detects completion from the reserve reversal, not from ledger rows', async () => {
    // A pool whose contributors had already withdrawn everything recovers
    // nothing and writes NO ledger rows. A ledger-based completion check would
    // keep reselecting it forever, re-running the reversal every time.
    const { prisma, service } = setup({
      walletsByUser: { 'trainer-1': { id: 'wallet-1', royaltyBalance: '0' } },
      alreadyReversed: ['pool-1'],
    });

    const result = await service.recoverReversedPayments();

    expect(result.poolsReversed).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing when no payment has been reversed', async () => {
    const { prisma, service } = setup({ pools: [] });

    const result = await service.recoverReversedPayments();

    expect(result.poolsReversed).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('handles several contributors across a pool', async () => {
    const { service } = setup({
      pools: [
        pool({
          accruals: [
            { contributorId: 'a', amountDl: new Prisma.Decimal('60') },
            { contributorId: 'b', amountDl: new Prisma.Decimal('40') },
          ],
        }),
      ],
      walletsByUser: {
        a: { id: 'wallet-a', royaltyBalance: '60' },
        b: { id: 'wallet-b', royaltyBalance: '10' },
      },
    });

    const result = await service.recoverReversedPayments();

    expect(result.recoveredDl).toBe('70');
    expect(result.shortfallDl).toBe('30');
    expect(result.contributorsAffected).toBe(2);
  });
});
