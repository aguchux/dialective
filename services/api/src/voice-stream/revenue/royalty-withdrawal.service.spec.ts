import { Prisma } from '@dialectiva/db';
import { RoyaltyWithdrawalService } from './royalty-withdrawal.service';

/**
 * Royalty payouts. Section 8 of docs/Stream-Revenue-Sharing-Engine.md is
 * unusually specific about three things, and each is a test here: the debit is a
 * guarded updateMany and never read-then-write, a request never spends across
 * both balance columns, and a rejection returns DL to royaltyBalance rather than
 * to the spendable one.
 */
function setup(
  options: {
    royaltiesEnabled?: boolean;
    minimumPayout?: number;
    tokenUsdRate?: number;
    kycRequired?: boolean;
    kycMinTokens?: number;
    kycStatus?: string;
    royaltyBalance?: string | null;
    payoutAccount?: Record<string, unknown> | null;
    debitCount?: number;
    existing?: Record<string, unknown> | null;
  } = {},
) {
  const tx = {
    wallet: {
      updateMany: jest.fn().mockResolvedValue({ count: options.debitCount ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    royaltyWithdrawalRequest: {
      create: jest.fn().mockResolvedValue({ id: 'rwd-1', status: 'PENDING' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    wallet: {
      findUnique: jest.fn().mockResolvedValue(
        options.royaltyBalance === null
          ? null
          : {
              id: 'wallet-1',
              royaltyBalance: new Prisma.Decimal(options.royaltyBalance ?? '1000'),
            },
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ kycStatus: options.kycStatus ?? 'APPROVED' }),
    },
    payoutAccount: {
      findFirst: jest.fn().mockResolvedValue(
        options.payoutAccount === null
          ? null
          : (options.payoutAccount ?? {
              id: 'pa-1',
              type: 'BANK',
              verificationStatus: 'VERIFIED',
            }),
      ),
    },
    royaltyWithdrawalRequest: {
      findUnique: jest.fn().mockResolvedValue(
        options.existing === undefined
          ? {
              id: 'rwd-1',
              walletId: 'wallet-1',
              tokenAmount: new Prisma.Decimal('600'),
              status: 'PENDING',
            }
          : options.existing,
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const settings = {
    areRoyaltiesEnabled: jest.fn().mockResolvedValue(options.royaltiesEnabled ?? true),
    getRoyaltyMinimumPayout: jest.fn().mockResolvedValue(options.minimumPayout ?? 500),
    getTokenUsdRate: jest.fn().mockResolvedValue(options.tokenUsdRate ?? 0.16),
    isKycRequiredForWithdrawals: jest.fn().mockResolvedValue(options.kycRequired ?? false),
    getKycMinWithdrawalTokens: jest.fn().mockResolvedValue(options.kycMinTokens ?? 1000),
  };
  const service = new RoyaltyWithdrawalService(prisma as never, settings as never);
  return { prisma, tx, settings, service };
}

const REQUEST = { userId: 'trainer-1', tokenAmount: 600, payoutAccountId: 'pa-1' };

describe('RoyaltyWithdrawalService.create: the debit', () => {
  it('debits royaltyBalance with a guarded updateMany, never read-then-write', async () => {
    // THE rule section 8 states in code. A read-then-compare-then-update would
    // let two concurrent requests both pass a check taken before either debit
    // landed.
    const { tx, service } = setup();

    await service.create(REQUEST);

    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'wallet-1', royaltyBalance: { gte: new Prisma.Decimal(600) } },
      data: { royaltyBalance: { decrement: new Prisma.Decimal(600) } },
    });
  });

  it('never touches balance or lockedBalance', async () => {
    // One column per request. A two-column debit cannot be one atomic guard.
    const { tx, service } = setup();

    await service.create(REQUEST);

    const debit = JSON.stringify(tx.wallet.updateMany.mock.calls[0][0]);
    expect(debit).toContain('royaltyBalance');
    expect(debit).not.toContain('"balance"');
    expect(debit).not.toContain('lockedBalance');
  });

  it('writes no request row when the debit misses', async () => {
    // Unlike the wallet rail, which creates rows then compensates by deleting
    // them, this checks the debit FIRST -- so there is nothing to compensate and
    // no untyped delete to get wrong.
    const { tx, service } = setup({ debitCount: 0 });

    await expect(service.create(REQUEST)).rejects.toThrow('Insufficient royalty balance');
    expect(tx.royaltyWithdrawalRequest.create).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('writes a negative ROYALTY_WITHDRAWAL ledger row against the request', async () => {
    const { tx, service } = setup();

    await service.create(REQUEST);

    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toEqual({
      walletId: 'wallet-1',
      type: 'ROYALTY_WITHDRAWAL',
      amount: new Prisma.Decimal(-600),
      reference: 'rwd-1',
    });
  });

  it('snapshots the USD value at request time', async () => {
    const { tx, service } = setup({ tokenUsdRate: 0.16 });

    const result = await service.create(REQUEST);

    expect(result.usdAmount).toBe('96');
    expect(tx.royaltyWithdrawalRequest.create.mock.calls[0][0].data.usdAmount.toString()).toBe(
      '96',
    );
  });

  it('debits and creates in one transaction', async () => {
    const { prisma, service } = setup();

    await service.create(REQUEST);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('RoyaltyWithdrawalService.validate: the gates', () => {
  it('refuses when royalties are not enabled', async () => {
    const { service } = setup({ royaltiesEnabled: false });

    await expect(service.create(REQUEST)).rejects.toThrow(
      'Stream revenue sharing is not enabled',
    );
  });

  it('holds a balance below the minimum, and says it keeps accruing', async () => {
    // Nothing is lost -- it rolls forward. A contributor reading this must not
    // think their earnings were refused.
    const { service } = setup({ minimumPayout: 500 });

    await expect(
      service.create({ ...REQUEST, tokenAmount: 499 }),
    ).rejects.toThrow('Royalty payouts start at 500 DL');
  });

  it('allows a payout exactly at the minimum', async () => {
    const { service } = setup({ minimumPayout: 500 });

    await expect(service.create({ ...REQUEST, tokenAmount: 500 })).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('rejects a non-positive amount', async () => {
    const { service } = setup();

    await expect(service.create({ ...REQUEST, tokenAmount: 0 })).rejects.toThrow(
      'must be positive',
    );
    await expect(service.create({ ...REQUEST, tokenAmount: -5 })).rejects.toThrow(
      'must be positive',
    );
  });

  it('refuses a payout account that is not the caller\'s', async () => {
    // Ownership is checked server-side, never trusted from the body.
    const { prisma, service } = setup({ payoutAccount: null });

    await expect(service.create(REQUEST)).rejects.toThrow('Payout account not found');
    expect(prisma.payoutAccount.findFirst.mock.calls[0][0].where).toEqual({
      id: 'pa-1',
      userId: 'trainer-1',
    });
  });

  it('refuses an unfinished Stripe Connect account', async () => {
    // Better than a provider failure after the DL has already been debited.
    const { service } = setup({
      payoutAccount: { id: 'pa-1', type: 'STRIPE_CONNECT', verificationStatus: 'PENDING' },
    });

    await expect(service.create(REQUEST)).rejects.toThrow('Finish setting up');
  });

  it('refuses when the royalty balance is short', async () => {
    const { service } = setup({ royaltyBalance: '100' });

    await expect(service.create(REQUEST)).rejects.toThrow('Insufficient royalty balance');
  });
});

describe('RoyaltyWithdrawalService: KYC gates as hard as the wallet rail', () => {
  it('blocks a declined verdict at any amount', async () => {
    // A resolved negative verdict is not the same as "not finished yet".
    const { service } = setup({ kycRequired: true, kycStatus: 'DECLINED' });

    await expect(service.create(REQUEST)).rejects.toThrow('was not approved');
  });

  it('blocks an expired verdict at any amount', async () => {
    const { service } = setup({
      kycRequired: true,
      kycStatus: 'EXPIRED',
      kycMinTokens: 1000000,
    });

    await expect(service.create(REQUEST)).rejects.toThrow('was not approved');
  });

  it('requires verification AT OR ABOVE the threshold, not below it', async () => {
    // Direction matters: inverting this comparison would wave the LARGEST
    // payouts through unverified, which is exactly backwards.
    const { service } = setup({
      kycRequired: true,
      kycStatus: 'NOT_STARTED',
      kycMinTokens: 500,
    });

    await expect(service.create({ ...REQUEST, tokenAmount: 600 })).rejects.toThrow(
      'Complete identity verification',
    );
  });

  it('exempts an unverified contributor below the threshold', async () => {
    const { service } = setup({
      kycRequired: true,
      kycStatus: 'NOT_STARTED',
      kycMinTokens: 1000,
      minimumPayout: 100,
    });

    await expect(service.create({ ...REQUEST, tokenAmount: 600 })).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('lets an approved contributor through without reading the threshold', async () => {
    const { settings, service } = setup({ kycRequired: true, kycStatus: 'APPROVED' });

    await service.create(REQUEST);

    expect(settings.getKycMinWithdrawalTokens).not.toHaveBeenCalled();
  });
});

describe('RoyaltyWithdrawalService.resolve', () => {
  it('returns a rejected payout to royaltyBalance, never to balance', async () => {
    // The laundering guard, on this rail. Routed through the same shared
    // planWithdrawalReversal helper the wallet rail uses.
    const { tx, service } = setup();

    await service.resolve({
      withdrawalId: 'rwd-1',
      outcome: 'rejected',
      adminId: 'admin-1',
    });

    expect(tx.wallet.update.mock.calls[0][0].data).toEqual({
      royaltyBalance: { increment: new Prisma.Decimal('600') },
    });
    expect(tx.ledgerEntry.create.mock.calls[0][0].data.type).toBe(
      'ROYALTY_WITHDRAWAL_REVERSED',
    );
  });

  it('credits nothing back when marked paid', async () => {
    const { tx, service } = setup();

    await service.resolve({ withdrawalId: 'rwd-1', outcome: 'paid', adminId: 'admin-1' });

    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('claims the status before resolving, so a double-click cannot resolve twice', async () => {
    // On the paid branch a second resolution would send a second "you've been
    // paid" notification over what may have been a second real transfer.
    const { tx, service } = setup();

    await service.resolve({ withdrawalId: 'rwd-1', outcome: 'paid', adminId: 'admin-1' });

    expect(tx.royaltyWithdrawalRequest.updateMany.mock.calls[0][0].where).toEqual({
      id: 'rwd-1',
      status: 'PENDING',
    });
  });

  it('refuses when the claim loses a race', async () => {
    const { tx, service } = setup();
    tx.royaltyWithdrawalRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resolve({ withdrawalId: 'rwd-1', outcome: 'rejected', adminId: 'admin-1' }),
    ).rejects.toThrow('updated by someone else');
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('refuses to resolve an already-resolved request', async () => {
    const { service } = setup({
      existing: {
        id: 'rwd-1',
        walletId: 'wallet-1',
        tokenAmount: new Prisma.Decimal('600'),
        status: 'PAID',
      },
    });

    await expect(
      service.resolve({ withdrawalId: 'rwd-1', outcome: 'rejected', adminId: 'admin-1' }),
    ).rejects.toThrow('already resolved');
  });

  it('404s on an unknown request', async () => {
    const { service } = setup({ existing: null });

    await expect(
      service.resolve({ withdrawalId: 'nope', outcome: 'paid', adminId: 'admin-1' }),
    ).rejects.toThrow('not found');
  });
});
