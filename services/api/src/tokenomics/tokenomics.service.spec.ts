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
        reserveTransaction: { findMany: jest.fn().mockResolvedValue([]) },
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
      // reconstructing the ratio via reserve rows + a single USER account.
      prisma.reserveTransaction.findMany.mockResolvedValue([
        { direction: 'CREDIT', eligibleUsdAmount: new Prisma.Decimal(ratio * 100) },
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
});
