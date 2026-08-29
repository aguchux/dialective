import {
  Prisma,
  ReserveDirection,
  ReserveTransactionStatus,
  ReserveTransactionType,
} from '@dialectiva/db';
import { TokenomicsService } from './tokenomics.service';

function makeAccount(overrides: Partial<{ id: string; available: string; locked: string }> = {}) {
  return {
    id: overrides.id ?? 'account-1',
    code: 'user:user-1',
    userId: 'user-1',
    available: new Prisma.Decimal(overrides.available ?? '10'),
    locked: new Prisma.Decimal(overrides.locked ?? '0'),
  };
}

describe('TokenomicsService', () => {
  it('records a confirmed NOWPayments funding event as one eligible USD reserve credit', async () => {
    const reserveAccount = { upsert: jest.fn().mockResolvedValue({ id: 'reserve-usdt' }) };
    const reserveTransaction = { upsert: jest.fn().mockResolvedValue({ id: 'reserve-event' }) };
    const tx = { reserveAccount, reserveTransaction };
    const prisma = {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    };
    const settings = { getTokenUsdRate: jest.fn().mockResolvedValue(0.1) };
    const service = new TokenomicsService(prisma as never, settings as never);

    await service.recordConfirmedNowPaymentsDeposit({
      depositId: 'deposit-1',
      providerChargeId: 'invoice-1',
      providerPaymentId: 'payment-1',
      currency: 'USDT',
      usdAmount: '10',
      actuallyPaid: '10',
      payCurrency: 'USDT',
    });

    expect(reserveAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_asset_network: { provider: 'nowpayments', asset: 'USDT', network: 'TRC20' },
        },
      }),
    );
    expect(reserveTransaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'nowpayments:deposit:deposit-1' },
        create: expect.objectContaining({
          type: ReserveTransactionType.PAYMENT_FUNDING,
          status: ReserveTransactionStatus.ELIGIBLE,
          direction: ReserveDirection.CREDIT,
          eligibleUsdAmount: expect.anything(),
        }),
      }),
    );
  });

  describe('lockTx / unlockTx', () => {
    function makeTx(account: ReturnType<typeof makeAccount>) {
      const tokenAccount = {
        upsert: jest.fn().mockResolvedValue(account),
        update: jest.fn().mockResolvedValue(account),
        findUniqueOrThrow: jest.fn().mockResolvedValue(account),
      };
      const tokenOperation = {
        upsert: jest.fn().mockResolvedValue({ id: 'op-1' }),
      };
      const tokenLedgerEntry = {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      };
      return { tokenAccount, tokenOperation, tokenLedgerEntry };
    }

    it('rejects locking more than the available balance', async () => {
      const account = makeAccount({ available: '5' });
      const tx = makeTx(account);
      const service = new TokenomicsService({} as never, {} as never);

      await expect(
        service.lockTx(tx as never, 'user-1', { amount: 10, idempotencyKey: 'key-1' }),
      ).rejects.toThrow('Insufficient available balance to lock');
    });

    it('rejects unlocking more than the locked balance', async () => {
      const account = makeAccount({ available: '5', locked: '2' });
      const tx = makeTx(account);
      const service = new TokenomicsService({} as never, {} as never);

      await expect(
        service.unlockTx(tx as never, 'user-1', { amount: 10, idempotencyKey: 'key-1' }),
      ).rejects.toThrow('Insufficient locked balance to unlock');
    });

    it('applies a lock exactly once when the same idempotencyKey is replayed', async () => {
      const account = makeAccount({ available: '10' });
      const tx = makeTx(account);
      const service = new TokenomicsService({} as never, {} as never);

      await service.lockTx(tx as never, 'user-1', { amount: 4, idempotencyKey: 'key-1' });
      expect(tx.tokenLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(tx.tokenAccount.update).toHaveBeenCalledTimes(1);

      // Replay: findUnique now resolves an existing entry, so the balance delta must not reapply.
      tx.tokenLedgerEntry.findUnique.mockResolvedValueOnce({ id: 'entry-1' });
      await service.lockTx(tx as never, 'user-1', { amount: 4, idempotencyKey: 'key-1' });
      expect(tx.tokenLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(tx.tokenAccount.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('burnTx', () => {
    it('rejects burning more than the source account owns', async () => {
      const source = makeAccount({ id: 'source-1', available: '5' });
      const burnAccount = makeAccount({ id: 'burn-1', available: '0' });
      const tokenAccount = {
        findUnique: jest.fn().mockResolvedValue(source),
        upsert: jest.fn().mockResolvedValue(burnAccount),
        update: jest.fn(),
      };
      const tx = { tokenAccount };
      const service = new TokenomicsService({} as never, {} as never);

      await expect(
        service.burnTx(tx as never, 'user:user-1', { amount: 10, idempotencyKey: 'key-1' }),
      ).rejects.toThrow('Insufficient available balance to burn');
    });

    it('rejects burning from an unknown account code', async () => {
      const tokenAccount = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { tokenAccount };
      const service = new TokenomicsService({} as never, {} as never);

      await expect(
        service.burnTx(tx as never, 'user:missing', { amount: 1, idempotencyKey: 'key-1' }),
      ).rejects.toThrow('Unknown token account');
    });
  });

  describe('deriveHealthStatus (via getStatus)', () => {
    function makeStatusHarness(policyOverrides: Record<string, string> = {}) {
      const policy = {
        baseCurrency: 'USD',
        enabled: true,
        mintingPaused: false,
        healthyCoverageThreshold: new Prisma.Decimal(policyOverrides.healthy ?? '1'),
        watchCoverageThreshold: new Prisma.Decimal(policyOverrides.watch ?? '0.8'),
        restrictedCoverageThreshold: new Prisma.Decimal(policyOverrides.restricted ?? '0.6'),
      };
      const prisma = {
        tokenomicsPolicy: { upsert: jest.fn().mockResolvedValue(policy) },
        reserveBalanceSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
        tokenAccount: { findMany: jest.fn().mockResolvedValue([]) },
        valuationSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      return prisma;
    }

    it.each([
      [1.0, 'HEALTHY'],
      [0.9, 'WATCH'],
      [0.7, 'RESTRICTED'],
      [0.5, 'CRITICAL'],
    ])('coverageRatio %f maps to %s', async (ratio, expected) => {
      const prisma = makeStatusHarness();
      // eligibleReserveUsd and redeemable supply are both driven by empty
      // arrays above, so directly stub getStatus's internal computation by
      // reconstructing the ratio via cached provider balances + a single
      // USER account.
      prisma.reserveBalanceSnapshot.findMany.mockResolvedValue([
        {
          provider: 'flutterwave',
          currency: 'USD',
          balanceRaw: new Prisma.Decimal(ratio * 100),
          balanceUsd: new Prisma.Decimal(ratio * 100),
          fetchedAt: new Date(),
        },
      ]);
      prisma.tokenAccount.findMany.mockResolvedValue([
        { kind: 'USER', available: new Prisma.Decimal(1000), locked: new Prisma.Decimal(0) },
      ]);
      const settings = { getTokenUsdRate: jest.fn().mockResolvedValue(0.1) };
      const service = new TokenomicsService(prisma as never, settings as never);

      const status = await service.getStatus();
      expect(status.reserveHealthStatus).toBe(expected);
    });

    it('returns HEALTHY when there is no redeemable liability yet', async () => {
      const prisma = makeStatusHarness();
      const settings = { getTokenUsdRate: jest.fn().mockResolvedValue(0.1) };
      const service = new TokenomicsService(prisma as never, settings as never);

      const status = await service.getStatus();
      expect(status.coverageRatio).toBeNull();
      expect(status.reserveHealthStatus).toBe('HEALTHY');
    });

    it('sums cached ReserveBalanceSnapshot rows as eligibleReserveUsd, not the ReserveTransaction ledger', async () => {
      const prisma = makeStatusHarness();
      prisma.reserveBalanceSnapshot.findMany.mockResolvedValue([
        {
          provider: 'flutterwave',
          currency: 'NGN',
          balanceRaw: new Prisma.Decimal(1000),
          balanceUsd: new Prisma.Decimal(60),
          fetchedAt: new Date('2026-08-29T10:00:00Z'),
        },
        {
          provider: 'nowpayments',
          currency: 'USDT',
          balanceRaw: new Prisma.Decimal(40),
          balanceUsd: new Prisma.Decimal(40),
          fetchedAt: new Date('2026-08-29T10:05:00Z'),
        },
      ]);
      const settings = { getTokenUsdRate: jest.fn().mockResolvedValue(0.1) };
      const service = new TokenomicsService(prisma as never, settings as never);

      const status = await service.getStatus();
      expect(status.eligibleReserveUsd).toBe(100);
      expect(status.reserveBalances).toEqual([
        {
          provider: 'flutterwave',
          currency: 'NGN',
          balanceRaw: '1000',
          balanceUsd: '60',
          fetchedAt: new Date('2026-08-29T10:00:00Z'),
        },
        {
          provider: 'nowpayments',
          currency: 'USDT',
          balanceRaw: '40',
          balanceUsd: '40',
          fetchedAt: new Date('2026-08-29T10:05:00Z'),
        },
      ]);
    });

    it('yields eligibleReserveUsd: 0 (not an error) when no balance has ever been polled', async () => {
      const prisma = makeStatusHarness();
      const settings = { getTokenUsdRate: jest.fn().mockResolvedValue(0.1) };
      const service = new TokenomicsService(prisma as never, settings as never);

      const status = await service.getStatus();
      expect(status.eligibleReserveUsd).toBe(0);
      expect(status.reserveBalances).toEqual([]);
      expect(status.reserveBalancesFetchedAt).toBeNull();
    });
  });

  describe('ensureUserAccountTx', () => {
    it('upserts idempotently by userId', async () => {
      const account = makeAccount();
      const tokenAccount = { upsert: jest.fn().mockResolvedValue(account) };
      const tx = { tokenAccount };
      const service = new TokenomicsService({} as never, {} as never);

      await service.ensureUserAccountTx(tx as never, 'user-1');
      expect(tokenAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ code: 'user:user-1' }),
        }),
      );
    });
  });

  describe('listReserveTransactions', () => {
    function makePrisma() {
      return {
        reserveTransaction: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
    }

    it('computes skip from page and pageSize', async () => {
      const prisma = makePrisma();
      const service = new TokenomicsService(prisma as never, {} as never);

      await service.listReserveTransactions({ page: 2, pageSize: 20 });
      expect(prisma.reserveTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });

    it.each([
      [45, 20, 3],
      [0, 20, 1],
      [20, 20, 1],
      [21, 20, 2],
    ])('total=%d pageSize=%d -> totalPages=%d', async (total, pageSize, totalPages) => {
      const prisma = makePrisma();
      prisma.reserveTransaction.count.mockResolvedValue(total);
      const service = new TokenomicsService(prisma as never, {} as never);

      const result = await service.listReserveTransactions({ page: 1, pageSize });
      expect(result.totalPages).toBe(totalPages);
    });

    it('passes only the supplied filters through to where', async () => {
      const prisma = makePrisma();
      const service = new TokenomicsService(prisma as never, {} as never);

      await service.listReserveTransactions({
        page: 1,
        pageSize: 20,
        type: ReserveTransactionType.FEE,
      });
      expect(prisma.reserveTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: ReserveTransactionType.FEE, status: undefined, direction: undefined },
        }),
      );
    });
  });

  describe('listTokenOperations', () => {
    function makePrisma() {
      return {
        tokenOperation: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
    }

    it('computes skip from page and pageSize', async () => {
      const prisma = makePrisma();
      const service = new TokenomicsService(prisma as never, {} as never);

      await service.listTokenOperations({ page: 3, pageSize: 10 });
      expect(prisma.tokenOperation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('passes only the supplied filters through to where', async () => {
      const prisma = makePrisma();
      const service = new TokenomicsService(prisma as never, {} as never);

      await service.listTokenOperations({ page: 1, pageSize: 20 });
      expect(prisma.tokenOperation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { type: undefined, status: undefined } }),
      );
    });
  });

  describe('updatePolicy', () => {
    function makePolicy(overrides: Record<string, string> = {}) {
      return {
        healthyCoverageThreshold: new Prisma.Decimal(overrides.healthy ?? '1'),
        watchCoverageThreshold: new Prisma.Decimal(overrides.watch ?? '0.8'),
        restrictedCoverageThreshold: new Prisma.Decimal(overrides.restricted ?? '0.6'),
      };
    }

    it('rejects when the merged thresholds violate healthy >= watch >= restricted', async () => {
      const policy = makePolicy();
      const prisma = {
        tokenomicsPolicy: {
          upsert: jest.fn().mockResolvedValue(policy),
          update: jest.fn(),
        },
      };
      const service = new TokenomicsService(prisma as never, {} as never);

      // Only restrictedCoverageThreshold supplied, raised above the existing
      // watchCoverageThreshold -- proves the merge-with-current-values path
      // is exercised, not just an all-three-supplied case.
      await expect(service.updatePolicy({ restrictedCoverageThreshold: 0.9 })).rejects.toThrow(
        'Coverage thresholds must satisfy healthy >= watch >= restricted',
      );
      expect(prisma.tokenomicsPolicy.update).not.toHaveBeenCalled();
    });

    it('accepts a partial update and merges against current values', async () => {
      const policy = makePolicy();
      const prisma = {
        tokenomicsPolicy: {
          upsert: jest.fn().mockResolvedValue(policy),
          update: jest.fn().mockResolvedValue(policy),
        },
      };
      const service = new TokenomicsService(prisma as never, {} as never);

      await service.updatePolicy({ watchCoverageThreshold: 0.7 });
      expect(prisma.tokenomicsPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'default' },
          data: expect.objectContaining({ watchCoverageThreshold: 0.7 }),
        }),
      );
    });

    it.each([0, 1])('accepts boundary maxIncreaseRate value %d', async (value) => {
      const policy = makePolicy();
      const prisma = {
        tokenomicsPolicy: {
          upsert: jest.fn().mockResolvedValue(policy),
          update: jest.fn().mockResolvedValue(policy),
        },
      };
      const service = new TokenomicsService(prisma as never, {} as never);

      await expect(service.updatePolicy({ maxIncreaseRate: value })).resolves.toBeDefined();
    });
  });
});
