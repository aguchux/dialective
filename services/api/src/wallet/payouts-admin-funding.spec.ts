import { adjustAdminWallet, creditAdminFunding, creditStartupBonus, Prisma } from '@dialectiva/db';

const { Decimal } = Prisma;

/**
 * Exercises packages/db/src/payouts.ts's creditAdminFunding/creditStartupBonus
 * directly against a mocked Prisma client -- same shared-package testing
 * pattern as distributors/payouts-distributor-chain.spec.ts. Both functions
 * are deliberately simple (no referral/distributor bonus fan-out): an admin
 * manually crediting one account, or the automatic one-time signup bonus,
 * isn't a training-payout or deposit event for referral-bonus purposes.
 */

function setupWallet(existingWallet?: {
  id: string;
  userId: string;
  balance: InstanceType<typeof Decimal>;
}) {
  const wallets = new Map<
    string,
    { id: string; userId: string; balance: InstanceType<typeof Decimal> }
  >();
  if (existingWallet) wallets.set(existingWallet.userId, existingWallet);
  const ledgerEntries: {
    walletId: string;
    type: string;
    amount: InstanceType<typeof Decimal>;
    reference: string;
  }[] = [];

  const prisma = {
    wallet: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(wallets.get(where.userId) ?? null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id?: string; userId?: string } }) => {
        const wallet = where.userId
          ? wallets.get(where.userId)
          : [...wallets.values()].find((candidate) => candidate.id === where.id);
        if (!wallet) return Promise.reject(new Error('Wallet not found'));
        return Promise.resolve(wallet);
      }),
      create: jest.fn(({ data }: { data: { userId: string } }) => {
        const wallet = {
          id: `wallet-${data.userId}`,
          userId: data.userId,
          balance: new Decimal(0),
        };
        wallets.set(data.userId, wallet);
        return Promise.resolve(wallet);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: {
            balance: { increment: InstanceType<typeof Decimal> } | InstanceType<typeof Decimal>;
          };
        }) => {
          const wallet = [...wallets.values()].find((w) => w.id === where.id);
          if (wallet) {
            wallet.balance =
              'increment' in data.balance
                ? wallet.balance.add(data.balance.increment)
                : data.balance;
          }
          return Promise.resolve(wallet);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; balance?: { gte: InstanceType<typeof Decimal> } };
          data: { balance: { decrement: InstanceType<typeof Decimal> } };
        }) => {
          const wallet = [...wallets.values()].find((w) => w.id === where.id);
          if (!wallet || (where.balance?.gte && wallet.balance.lt(where.balance.gte))) {
            return Promise.resolve({ count: 0 });
          }
          wallet.balance = wallet.balance.sub(data.balance.decrement);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    ledgerEntry: {
      findFirst: jest.fn(({ where }: { where: { walletId: string; type: string } }) =>
        Promise.resolve(
          ledgerEntries.find(
            (entry) => entry.walletId === where.walletId && entry.type === where.type,
          ) ?? null,
        ),
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            walletId: string;
            type: string;
            amount: InstanceType<typeof Decimal>;
            reference: string;
          };
        }) => {
          ledgerEntries.push(data);
          return Promise.resolve(data);
        },
      ),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (ops: unknown) => {
    if (typeof ops === 'function') return ops(prisma);
    return Promise.all(ops as Promise<unknown>[]);
  });

  return { prisma: prisma as never, wallets, ledgerEntries };
}

describe('creditAdminFunding', () => {
  it('credits the wallet and writes an ADMIN_FUNDING ledger entry, creating the wallet if missing', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    const result = await creditAdminFunding(
      prisma,
      'user-1',
      250,
      'Manual correction for missed payout',
    );

    expect(result).toEqual({
      userId: 'user-1',
      reference: 'Manual correction for missed payout',
      amount: '250',
    });
    expect(wallets.get('user-1')!.balance.toString()).toBe('250');
    expect(ledgerEntries).toEqual([
      expect.objectContaining({
        type: 'ADMIN_FUNDING',
        reference: 'Manual correction for missed payout',
      }),
    ]);
    expect(ledgerEntries[0].amount.toString()).toBe('250');
  });

  it('adds to an existing balance rather than replacing it', async () => {
    const { prisma, wallets } = setupWallet({
      id: 'wallet-user-1',
      userId: 'user-1',
      balance: new Decimal('40'),
    });

    await creditAdminFunding(prisma, 'user-1', 10, 'top-up');

    expect(wallets.get('user-1')!.balance.toString()).toBe('50');
  });
});

describe('creditStartupBonus', () => {
  it('credits the wallet and writes a STARTUP_BONUS ledger entry', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    await creditStartupBonus(prisma, 'user-1', 5, 'signup-verification');

    expect(wallets.get('user-1')!.balance.toString()).toBe('5');
    expect(ledgerEntries).toEqual([
      expect.objectContaining({ type: 'STARTUP_BONUS', reference: 'signup-verification' }),
    ]);
    expect(ledgerEntries[0].amount.toString()).toBe('5');
  });

  it('does not credit a second STARTUP_BONUS for the same wallet', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    await creditStartupBonus(prisma, 'user-1', 5, 'signup-verification');
    await creditStartupBonus(prisma, 'user-1', 5, 'signup-verification');

    expect(wallets.get('user-1')!.balance.toString()).toBe('5');
    expect(ledgerEntries).toHaveLength(1);
  });
});

describe('adjustAdminWallet', () => {
  it('debits the wallet silently and writes a signed ADMIN_ADJUSTMENT ledger entry', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet({
      id: 'wallet-user-1',
      userId: 'user-1',
      balance: new Decimal('40'),
    });

    const result = await adjustAdminWallet(
      prisma,
      'user-1',
      -15,
      'duplicate signup bonus correction',
    );

    expect(result).toEqual({
      userId: 'user-1',
      reference: 'duplicate signup bonus correction',
      amount: '-15',
      balance: '25',
    });
    expect(wallets.get('user-1')!.balance.toString()).toBe('25');
    expect(ledgerEntries).toEqual([
      expect.objectContaining({
        type: 'ADMIN_ADJUSTMENT',
        reference: 'duplicate signup bonus correction',
      }),
    ]);
    expect(ledgerEntries[0].amount.toString()).toBe('-15');
  });

  it('rejects a debit that would overdraw the wallet', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet({
      id: 'wallet-user-1',
      userId: 'user-1',
      balance: new Decimal('10'),
    });

    await expect(adjustAdminWallet(prisma, 'user-1', -15, 'overdraw')).rejects.toThrow(
      'Insufficient wallet balance for this debit',
    );

    expect(wallets.get('user-1')!.balance.toString()).toBe('10');
    expect(ledgerEntries).toHaveLength(0);
  });
});
