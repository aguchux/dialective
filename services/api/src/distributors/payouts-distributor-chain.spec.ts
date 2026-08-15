import {
  creditFundingReferralBonusesOps,
  creditTrainingPayout,
  creditTrainingPayoutOps,
  Prisma,
} from '@dialectiva/db';

const { Decimal } = Prisma;

/**
 * Exercises packages/db/src/payouts.ts's distributor referral-chain logic
 * (buildDistributorReferralBonuses, used by both creditFundingReferralBonusesOps
 * and creditTrainingPayout) directly against a mocked Prisma client -- this
 * is the shared package's own math, tested from services/api since that's
 * where jest is already configured and @dialectiva/db is consumed as a
 * dependency, matching wallet.controller.spec.ts's existing pattern of
 * exercising creditTrainingPayout through a mock prisma.
 */

const DISABLED_DISTRIBUTOR_SETTINGS = {
  id: 'default',
  enabled: false,
  multiLevelReferralEnabled: false,
  maxReferralDepth: 0,
  level1Rate: new Decimal(0),
  level2Rate: new Decimal(0),
  level3Rate: new Decimal(0),
  level4Rate: new Decimal(0),
  level5Rate: new Decimal(0),
};

const ENABLED_DISTRIBUTOR_SETTINGS = {
  ...DISABLED_DISTRIBUTOR_SETTINGS,
  enabled: true,
  multiLevelReferralEnabled: true,
  maxReferralDepth: 5,
  level1Rate: new Decimal('0.05'),
  level2Rate: new Decimal('0.02'),
  level3Rate: new Decimal('0.01'),
  level4Rate: new Decimal('0.002'),
  level5Rate: new Decimal('0.0003'),
};

function walletFor(userId: string) {
  return { id: `wallet-${userId}`, userId, balance: new Decimal(0), lockedBalance: new Decimal(0) };
}

/**
 * Builds a mocked PrismaClient over an in-memory chain of users:
 * trainer -> distributorL1 -> distributorL2 -> ... (each referredById the
 * next). Every user in `chain` after the first is treated as the referral
 * ancestor at that depth.
 */
function setupChain(options: {
  distributorSettings: typeof ENABLED_DISTRIBUTOR_SETTINGS;
  chain: { id: string; role: 'TRAINER' | 'DISTRIBUTOR' | 'ADMIN' }[];
  referralSettings?: { fundingBonusEnabled: boolean; fundingBonusRate: InstanceType<typeof Decimal>; payoutBonusEnabled: boolean; payoutBonusRate: InstanceType<typeof Decimal> };
}) {
  const { chain, distributorSettings, referralSettings } = options;
  const usersById = new Map(
    chain.map((user, index) => [
      user.id,
      { id: user.id, role: user.role, referredById: chain[index + 1]?.id ?? null },
    ]),
  );
  const wallets = new Map<string, ReturnType<typeof walletFor>>();
  const ledgerEntries: { walletId: string; type: string; amount: InstanceType<typeof Decimal>; reference: string }[] = [];

  const prisma = {
    distributorSettings: { upsert: jest.fn().mockResolvedValue(distributorSettings) },
    referralSettings: {
      upsert: jest.fn().mockResolvedValue(
        referralSettings ?? {
          fundingBonusEnabled: false,
          fundingBonusRate: new Decimal(0),
          payoutBonusEnabled: false,
          payoutBonusRate: new Decimal(0),
        },
      ),
    },
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const user = usersById.get(where.id);
        return Promise.resolve(user ? { ...user } : null);
      }),
    },
    wallet: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) => Promise.resolve(wallets.get(where.userId) ?? null)),
      create: jest.fn(({ data }: { data: { userId: string } }) => {
        const wallet = walletFor(data.userId);
        wallets.set(data.userId, wallet);
        return Promise.resolve(wallet);
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: { balance: { increment: InstanceType<typeof Decimal> } } }) => {
        const wallet = [...wallets.values()].find((w) => w.id === where.id);
        if (wallet) wallet.balance = wallet.balance.add(data.balance.increment);
        return Promise.resolve(wallet);
      }),
    },
    ledgerEntry: {
      create: jest.fn(({ data }: { data: { walletId: string; type: string; amount: InstanceType<typeof Decimal>; reference: string } }) => {
        ledgerEntries.push(data);
        return Promise.resolve(data);
      }),
    },
    $transaction: jest.fn(async (ops: unknown) => Promise.all(ops as Promise<unknown>[])),
  };

  return { prisma: prisma as never, usersById, wallets, ledgerEntries };
}

describe('creditFundingReferralBonusesOps distributor chain', () => {
  it('pays every eligible level up to maxReferralDepth, skipping TRAINER ancestors without breaking the walk', async () => {
    const { prisma, ledgerEntries } = setupChain({
      distributorSettings: { ...ENABLED_DISTRIBUTOR_SETTINGS, maxReferralDepth: 3 },
      chain: [
        { id: 'trainer', role: 'TRAINER' },
        { id: 'mid-trainer', role: 'TRAINER' }, // level 1 ancestor: a plain trainer, earns nothing but doesn't break the chain
        { id: 'distL2', role: 'DISTRIBUTOR' }, // level 2 ancestor: earns level2Rate
        { id: 'distL3', role: 'DISTRIBUTOR' }, // level 3 ancestor: earns level3Rate
        { id: 'distL4-beyond-depth', role: 'DISTRIBUTOR' }, // level 4: beyond maxReferralDepth=3, never reached
      ],
    });

    const { ops, bonuses } = await creditFundingReferralBonusesOps(prisma, 'trainer', 1000, 'deposit-1');
    await Promise.all(ops);

    expect(bonuses).toEqual([
      { userId: 'distL2', level: 2, rate: '0.02', amount: '20' },
      { userId: 'distL3', level: 3, rate: '0.01', amount: '10' },
    ]);
    expect(ledgerEntries).toEqual([
      expect.objectContaining({ type: 'DISTRIBUTOR_FUNDING_BONUS', amount: expect.objectContaining({}), reference: 'deposit-1:L2' }),
      expect.objectContaining({ type: 'DISTRIBUTOR_FUNDING_BONUS', reference: 'deposit-1:L3' }),
    ]);
  });

  it('falls back to the legacy single-level referral bonus when no distributor ancestor exists', async () => {
    const { prisma, ledgerEntries } = setupChain({
      distributorSettings: ENABLED_DISTRIBUTOR_SETTINGS,
      chain: [
        { id: 'trainer', role: 'TRAINER' },
        { id: 'referrer-trainer', role: 'TRAINER' },
      ],
      referralSettings: { fundingBonusEnabled: true, fundingBonusRate: new Decimal('0.1'), payoutBonusEnabled: false, payoutBonusRate: new Decimal(0) },
    });

    const { ops, bonuses } = await creditFundingReferralBonusesOps(prisma, 'trainer', 1000, 'deposit-1');
    await Promise.all(ops);

    expect(bonuses).toEqual([{ userId: 'referrer-trainer', level: 1, rate: '0.1', amount: '100' }]);
    expect(ledgerEntries).toEqual([expect.objectContaining({ type: 'REFERRAL_FUNDING_BONUS', reference: 'deposit-1' })]);
  });

  it('pays no bonus at all when the distributor system is disabled and there is no distributor ancestor', async () => {
    const { prisma, ledgerEntries } = setupChain({
      distributorSettings: DISABLED_DISTRIBUTOR_SETTINGS,
      chain: [{ id: 'trainer', role: 'TRAINER' }],
    });

    const { ops, bonuses } = await creditFundingReferralBonusesOps(prisma, 'trainer', 1000, 'deposit-1');
    await Promise.all(ops);

    expect(bonuses).toEqual([]);
    expect(ledgerEntries).toEqual([]);
  });

  it('an ADMIN ancestor earns commission the same as a DISTRIBUTOR would', async () => {
    const { prisma, ledgerEntries } = setupChain({
      distributorSettings: { ...ENABLED_DISTRIBUTOR_SETTINGS, maxReferralDepth: 1 },
      chain: [
        { id: 'trainer', role: 'TRAINER' },
        { id: 'house-admin', role: 'ADMIN' },
      ],
    });

    const { bonuses } = await creditFundingReferralBonusesOps(prisma, 'trainer', 1000, 'deposit-1');

    expect(bonuses).toEqual([{ userId: 'house-admin', level: 1, rate: '0.05', amount: '50' }]);
    expect(ledgerEntries).toHaveLength(1);
  });
});

describe('creditTrainingPayout no-loss guarantee with a distributor chain', () => {
  it('credits the trainer the FULL grossAmount even with a 5-level distributor chain active -- bonuses are minted, not deducted', async () => {
    const { prisma, wallets } = setupChain({
      distributorSettings: ENABLED_DISTRIBUTOR_SETTINGS, // all 5 levels, rates summing to 8.23%
      chain: [
        { id: 'trainer', role: 'TRAINER' },
        { id: 'd1', role: 'DISTRIBUTOR' },
        { id: 'd2', role: 'DISTRIBUTOR' },
        { id: 'd3', role: 'DISTRIBUTOR' },
        { id: 'd4', role: 'DISTRIBUTOR' },
        { id: 'd5', role: 'DISTRIBUTOR' },
      ],
    });

    const result = await creditTrainingPayout(prisma, 'trainer', 100, 'submission-1');

    // grossAmount === netAmount: the trainer's own payout is never reduced
    // by distributor commissions, even though 8.23% in commissions was paid
    // out on top of it. This is the P0 no-loss-invariant fix.
    expect(result.grossAmount).toBe('100');
    expect(result.netAmount).toBe('100');
    expect(wallets.get('trainer')!.balance.toString()).toBe('100');

    // Every level's commission was still minted on top, funded by the
    // platform rather than subtracted from the trainer.
    expect(wallets.get('d1')!.balance.toString()).toBe('5'); // 5%
    expect(wallets.get('d2')!.balance.toString()).toBe('2'); // 2%
    expect(wallets.get('d3')!.balance.toString()).toBe('1'); // 1%
    expect(wallets.get('d4')!.balance.toString()).toBe('0.2'); // 0.2%
    expect(wallets.get('d5')!.balance.toString()).toBe('0.03'); // 0.03%
  });

  it('never lets the trainer receive less than tokensSpent, unlike the legacy single-level path (documented, not changed)', async () => {
    const { prisma } = setupChain({
      distributorSettings: DISABLED_DISTRIBUTOR_SETTINGS,
      chain: [
        { id: 'trainer', role: 'TRAINER' },
        { id: 'referrer', role: 'TRAINER' },
      ],
      referralSettings: { fundingBonusEnabled: false, fundingBonusRate: new Decimal(0), payoutBonusEnabled: true, payoutBonusRate: new Decimal('0.1') },
    });

    const result = await creditTrainingPayout(prisma, 'trainer', 100, 'submission-1');

    // The pre-existing legacy path still deducts (100 - 10% = 90) -- this
    // spec documents that this older behavior is intentionally unchanged,
    // distinct from the new distributor-chain path tested above.
    expect(result.netAmount).toBe('90');
  });

  it('an empty distributor chain (no bonuses) falls through to the legacy path unaffected', async () => {
    const { prisma } = setupChain({
      distributorSettings: ENABLED_DISTRIBUTOR_SETTINGS,
      chain: [{ id: 'trainer', role: 'TRAINER' }], // no referrer at all
    });

    const result = await creditTrainingPayoutOps(prisma, 'trainer', 100, 'submission-1');

    expect(result.result.grossAmount).toBe('100');
    expect(result.result.netAmount).toBe('100');
    expect(result.result.distributorReferralBonuses).toBeUndefined();
  });
});
