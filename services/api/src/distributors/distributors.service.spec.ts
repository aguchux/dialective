import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { DistributorsService } from './distributors.service';

const { Decimal } = Prisma;

const DEFAULT_SETTINGS_ROW = {
  id: 'default',
  enabled: true,
  bulkAllocationEnabled: true,
  defaultBulkDiscountRate: new Decimal('0.05'),
  multiLevelReferralEnabled: true,
  maxReferralDepth: 5,
  level1Rate: new Decimal('0.05'),
  level2Rate: new Decimal('0.02'),
  level3Rate: new Decimal('0.01'),
  level4Rate: new Decimal('0.002'),
  level5Rate: new Decimal('0.0003'),
  updatedAt: new Date(),
  createdAt: new Date(),
};

function setup(settingsOverrides: Record<string, unknown> = {}) {
  const settingsRow = { ...DEFAULT_SETTINGS_ROW, ...settingsOverrides };
  const prisma: Record<string, unknown> = {
    distributorSettings: {
      upsert: jest.fn().mockResolvedValue(settingsRow),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    wallet: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    distributorAllocation: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ledgerEntry: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    p2PTokenOffer: { count: jest.fn().mockResolvedValue(0) },
    p2PTokenTrade: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn(async (input: unknown) => {
    if (typeof input === 'function') return (input as (tx: unknown) => unknown)(prisma);
    return Promise.all(input as Promise<unknown>[]);
  });
  const otp = {
    issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
    verify: jest.fn(),
  };
  const platformSettings = {
    getOtpChannel: jest.fn().mockResolvedValue('sms'),
    isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
  };
  const service = new DistributorsService(prisma as never, otp as never, platformSettings as never);
  return {
    service,
    prisma: prisma as never as {
      distributorSettings: { upsert: jest.Mock };
      user: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
        findUniqueOrThrow: jest.Mock;
        update: jest.Mock;
      };
      wallet: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
      refreshToken: { updateMany: jest.Mock };
      distributorAllocation: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
      ledgerEntry: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
      p2PTokenOffer: { count: jest.Mock };
      p2PTokenTrade: { count: jest.Mock };
      $transaction: jest.Mock;
    },
    otp,
    settingsRow,
  };
}

describe('DistributorsService.updateSettings', () => {
  it('rejects a rate outside 0-1', async () => {
    const { service } = setup();
    await expect(service.updateSettings({ level1Rate: 1.5 })).rejects.toThrow(BadRequestException);
  });

  it('rejects enabled-level rates summing above 100%', async () => {
    const { service } = setup();
    await expect(
      service.updateSettings({ maxReferralDepth: 2, level1Rate: 0.6, level2Rate: 0.6 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts rates summing above 100% when the excess levels are beyond maxReferralDepth', async () => {
    const { service, prisma } = setup();
    prisma.distributorSettings.upsert.mockResolvedValueOnce(DEFAULT_SETTINGS_ROW);
    await expect(
      service.updateSettings({ maxReferralDepth: 1, level1Rate: 0.5, level2Rate: 0.9 }),
    ).resolves.toBeDefined();
  });

  it('merges partial rate updates against the existing persisted row for the sum check', async () => {
    const { service, prisma } = setup({
      level1Rate: { toString: () => '0.9', toNumber: () => 0.9 },
      maxReferralDepth: 2,
    });
    // Only level2Rate is being patched; level1Rate (0.9, already persisted) must still count toward the sum.
    await expect(service.updateSettings({ level2Rate: 0.2 })).rejects.toThrow(BadRequestException);
  });
});

describe('DistributorsService.allocateTokens', () => {
  it('rejects when bulk allocation is disabled', async () => {
    const { service } = setup({ bulkAllocationEnabled: false });
    await expect(
      service.allocateTokens('admin-1', 'dist-1', { tokenAmount: 1000 }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects when the target user is not a DISTRIBUTOR', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER', wallet: null });
    await expect(
      service.allocateTokens('admin-1', 'trainer-1', { tokenAmount: 1000 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('credits the full tokenAmount to the wallet regardless of discountRate (discount is informational only)', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'dist-1',
      role: 'DISTRIBUTOR',
      wallet: { id: 'wallet-1' },
    });
    prisma.distributorAllocation.create.mockResolvedValue({
      id: 'alloc-1',
      distributorId: 'dist-1',
      grantedById: 'admin-1',
      tokenAmount: { toString: () => '1000000' },
      discountRate: { toString: () => '0.05' },
      note: null,
      createdAt: new Date(),
    });

    const result = await service.allocateTokens('admin-1', 'dist-1', {
      tokenAmount: 1_000_000,
      discountRate: 0.05,
    });

    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: { increment: expect.objectContaining({ d: expect.anything() }) } },
    });
    // The amount credited (ledger + wallet increment) is the full grant, not amount * (1 - discount).
    const ledgerCall = prisma.ledgerEntry.create.mock.calls[0][0];
    expect(ledgerCall.data.amount.toString()).toBe('1000000');
    expect(ledgerCall.data.type).toBe('DISTRIBUTOR_BULK_ALLOCATION');
    expect(result.tokenAmount).toBe('1000000');
    expect(result.discountRate).toBe('0.05');
  });

  it('creates a wallet for the distributor if one does not exist yet', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR', wallet: null });
    prisma.wallet.create.mockResolvedValue({ id: 'new-wallet-1' });
    prisma.distributorAllocation.create.mockResolvedValue({
      id: 'alloc-1',
      distributorId: 'dist-1',
      grantedById: 'admin-1',
      tokenAmount: { toString: () => '500' },
      discountRate: { toString: () => '0' },
      note: null,
      createdAt: new Date(),
    });

    await service.allocateTokens('admin-1', 'dist-1', { tokenAmount: 500 });

    expect(prisma.wallet.create).toHaveBeenCalledWith({ data: { userId: 'dist-1' } });
  });
});

describe('DistributorsService.network', () => {
  it('404s when the target user is not a DISTRIBUTOR', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER' });
    await expect(service.network('trainer-1')).rejects.toThrow(NotFoundException);
  });

  it('returns maxDepth 0 and an empty network when multiLevelReferralEnabled is off', async () => {
    const { service, prisma } = setup({ multiLevelReferralEnabled: false });
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR' });

    const result = await service.network('dist-1');

    expect(result.maxDepth).toBe(0);
    expect(result.tree).toEqual([]);
    expect(result.allMembers).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('caps the network view at the admin-configured maxReferralDepth, not a hardcoded 5', async () => {
    const { service, prisma } = setup({ maxReferralDepth: 2 });
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR' });
    prisma.user.findMany
      .mockResolvedValueOnce([
        {
          id: 'l1-a',
          firstName: 'Level',
          lastName: 'One',
          referredById: 'dist-1',
          wallet: { balance: { toString: () => '10' } },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'l2-a',
          firstName: 'Level',
          lastName: 'Two',
          referredById: 'l1-a',
          wallet: { balance: { toString: () => '20' } },
        },
      ]);

    const result = await service.network('dist-1');

    expect(result.maxDepth).toBe(2);
    // Only 2 findMany calls -- would be a 3rd call at level 3 if the depth cap weren't honoured.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    expect(result.tree).toHaveLength(1);
    expect(result.tree[0].children).toHaveLength(1);
    expect(result.totalMembers).toBe(2);
    expect(result.totalTokenBalance).toBe('30');
  });

  it('never includes a role field on network nodes (name + balance only)', async () => {
    const { service, prisma } = setup({ maxReferralDepth: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR' });
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'l1-a',
        firstName: 'Ada',
        lastName: 'Lovelace',
        referredById: 'dist-1',
        wallet: { balance: { toString: () => '5' } },
      },
    ]);

    const result = await service.network('dist-1');

    expect(result.tree[0]).toEqual({
      id: 'l1-a',
      name: 'Ada Lovelace',
      level: 1,
      tokenBalance: '5',
      children: [],
    });
    expect('role' in result.tree[0]).toBe(false);
  });

  it('falls back to "Member" instead of deriving a name from email', async () => {
    const { service, prisma } = setup({ maxReferralDepth: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR' });
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'l1-a',
        firstName: null,
        lastName: null,
        email: 'jane.doe@example.com',
        referredById: 'dist-1',
        wallet: null,
      },
    ]);

    const result = await service.network('dist-1');

    expect(result.tree[0].name).toBe('Member');
    expect(result.tree[0].tokenBalance).toBe('0');
  });

  it('batches each level into one findMany call regardless of node count (no N+1)', async () => {
    const { service, prisma } = setup({ maxReferralDepth: 3 });
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR' });
    const level1 = Array.from({ length: 50 }, (_, i) => ({
      id: `l1-${i}`,
      firstName: 'User',
      lastName: String(i),
      referredById: 'dist-1',
      wallet: { balance: { toString: () => '1' } },
    }));
    // Give level 2 at least one member so the loop actually reaches level 3
    // (loadNetworkLevels stops early once a level comes back empty, since
    // there's nothing left to look up children for -- that's a real
    // optimization, not a test artifact, so this fixture avoids it to
    // exercise all 3 configured levels).
    const level2 = [
      { id: 'l2-0', firstName: 'User', lastName: 'L2', referredById: 'l1-0', wallet: null },
    ];
    prisma.user.findMany
      .mockResolvedValueOnce(level1)
      .mockResolvedValueOnce(level2)
      .mockResolvedValueOnce([]);

    await service.network('dist-1');

    // 3 calls total, one per depth level -- NOT 1 (root) + 50 (one per level-1
    // node) + ... which is what an O(N) per-node recursive fetch would cost.
    // This is the assertion that would fail if loadNetworkLevels regressed
    // back to a per-node query.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(3);
  });
});

describe('DistributorsService.dashboard', () => {
  it('404s when the target user is not a DISTRIBUTOR', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER', wallet: null });
    await expect(service.dashboard('trainer-1')).rejects.toThrow(NotFoundException);
  });

  it('breaks referral bonuses down by level parsed from the ledger reference suffix', async () => {
    const { service, prisma } = setup({ maxReferralDepth: 0, multiLevelReferralEnabled: false });
    prisma.user.findUnique.mockResolvedValue({
      id: 'dist-1',
      role: 'DISTRIBUTOR',
      email: 'd@x.com',
      firstName: 'Dana',
      lastName: null,
      referralCode: 'ref1',
      wallet: { balance: { toString: () => '100' }, lockedBalance: { toString: () => '0' } },
    });
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { amount: new Decimal('10'), reference: 'dep-1:L1' },
      { amount: new Decimal('4'), reference: 'dep-2:L1' },
      { amount: new Decimal('2'), reference: 'dep-3:L2' },
    ]);

    const result = await service.dashboard('dist-1');

    expect(result.referralBonusesByLevel).toEqual([
      { level: 1, amount: '14' },
      { level: 2, amount: '2' },
    ]);
    expect(result.metrics.referralBonuses).toBe('16');
  });
});

describe('DistributorsService.listAdmin', () => {
  it('returns an empty list without querying ledger entries when there are no distributors', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.listAdmin();

    expect(result).toEqual([]);
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
  });

  it('sums positive ledger entries into totalCredit and negative ones (absolute value) into totalDebit, per wallet', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'd1',
        firstName: 'Ada',
        lastName: null,
        email: 'ada@x.com',
        status: 'ACTIVE',
        createdAt: new Date(),
        wallet: { id: 'w1', balance: new Decimal('120'), lockedBalance: new Decimal('0') },
      },
      {
        id: 'd2',
        firstName: null,
        lastName: null,
        email: 'd2@x.com',
        status: 'ACTIVE',
        createdAt: new Date(),
        wallet: null,
      },
    ]);
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { walletId: 'w1', amount: new Decimal('1000000') }, // bulk allocation credit
      { walletId: 'w1', amount: new Decimal('50') }, // referral bonus credit
      { walletId: 'w1', amount: new Decimal('-30') }, // P2P escrow lock / withdrawal debit
    ]);

    const result = await service.listAdmin();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'd1',
        name: 'Ada',
        tokenBalance: '120',
        totalCredit: '1000050',
        totalDebit: '30',
      }),
      expect.objectContaining({
        id: 'd2',
        name: 'Member',
        tokenBalance: '0',
        totalCredit: '0',
        totalDebit: '0',
      }),
    ]);
    // Wallet-less distributor never gets pulled into the walletId IN (...) query.
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith({
      where: { walletId: { in: ['w1'] } },
      select: { walletId: true, amount: true },
    });
  });
});

describe('DistributorsService.getActivity', () => {
  it('404s when the target user is not a DISTRIBUTOR', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER', wallet: null });
    await expect(service.getActivity('trainer-1', { page: 1, pageSize: 25 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns an empty page without querying ledger entries when the distributor has no wallet yet', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'dist-1', role: 'DISTRIBUTOR', wallet: null });

    const result = await service.getActivity('dist-1', { page: 1, pageSize: 25 });

    expect(result).toEqual({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 });
    expect(prisma.ledgerEntry.count).not.toHaveBeenCalled();
  });

  it("paginates the wallet's ledger entries newest first", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'dist-1',
      role: 'DISTRIBUTOR',
      wallet: { id: 'w1' },
    });
    prisma.ledgerEntry.count.mockResolvedValue(42);
    prisma.ledgerEntry.findMany.mockResolvedValue([
      {
        id: 'e1',
        type: 'DISTRIBUTOR_BULK_ALLOCATION',
        amount: new Decimal('1000000'),
        reference: 'alloc-1',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getActivity('dist-1', { page: 2, pageSize: 10 });

    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'w1' },
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result.items[0].amount).toBe('1000000');
    expect(result.total).toBe(42);
    expect(result.totalPages).toBe(5);
  });
});

describe('DistributorsService.allocateTokens (admin) excludes sub-distributors', () => {
  it('rejects funding a distributor that was promoted by another distributor', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      role: 'DISTRIBUTOR',
      promotedById: 'parent-1',
      wallet: null,
    });
    await expect(service.allocateTokens('admin-1', 'sub-1', { tokenAmount: 1000 })).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('DistributorsService.promoteSubDistributor', () => {
  it('rejects when the caller is not a DISTRIBUTOR', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === 'caller-1'
        ? { id: 'caller-1', role: 'TRAINER' }
        : { id: 'target-1', referredById: 'caller-1', role: 'TRAINER' },
    );
    await expect(service.promoteSubDistributor('caller-1', 'target-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects when the target is not the caller's direct referral", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === 'caller-1'
        ? { id: 'caller-1', role: 'DISTRIBUTOR' }
        : { id: 'target-1', referredById: 'someone-else', role: 'TRAINER' },
    );
    await expect(service.promoteSubDistributor('caller-1', 'target-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects promoting a non-TRAINER', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === 'caller-1'
        ? { id: 'caller-1', role: 'DISTRIBUTOR' }
        : { id: 'target-1', referredById: 'caller-1', role: 'DISTRIBUTOR' },
    );
    await expect(service.promoteSubDistributor('caller-1', 'target-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('promotes a direct trainer referral, setting role=DISTRIBUTOR and promotedById=caller', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === 'caller-1'
        ? { id: 'caller-1', role: 'DISTRIBUTOR' }
        : { id: 'target-1', referredById: 'caller-1', role: 'TRAINER' },
    );
    prisma.user.update.mockResolvedValue({
      id: 'target-1',
      firstName: 'Ada',
      lastName: null,
      email: 'ada@x.com',
      role: 'DISTRIBUTOR',
    });

    const result = await service.promoteSubDistributor('caller-1', 'target-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-1' },
      data: { role: 'DISTRIBUTOR', promotedById: 'caller-1' },
    });
    expect(result).toEqual({
      id: 'target-1',
      name: 'Ada',
      email: 'ada@x.com',
      role: 'DISTRIBUTOR',
    });
  });
});

describe('DistributorsService.allocateToSubDistributor', () => {
  it("404s when the target is not the caller's own sub-distributor", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      role: 'DISTRIBUTOR',
      promotedById: 'someone-else',
    });
    await expect(
      service.allocateToSubDistributor('caller-1', 'sub-1', { tokenAmount: 1000 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('allocates when the target is owned by the caller', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      role: 'DISTRIBUTOR',
      promotedById: 'caller-1',
      wallet: { id: 'wallet-1' },
    });
    prisma.distributorAllocation.create.mockResolvedValue({
      id: 'alloc-1',
      distributorId: 'sub-1',
      grantedById: 'caller-1',
      tokenAmount: { toString: () => '500' },
      discountRate: { toString: () => '0' },
      note: null,
      createdAt: new Date(),
    });

    const result = await service.allocateToSubDistributor('caller-1', 'sub-1', {
      tokenAmount: 500,
    });

    expect(prisma.distributorAllocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ distributorId: 'sub-1', grantedById: 'caller-1' }),
      }),
    );
    expect(result.tokenAmount).toBe('500');
  });
});

describe('DistributorsService.updateSubDistributorStatus', () => {
  it("404s when the target is not the caller's own sub-distributor", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'sub-1', promotedById: 'someone-else' });
    await expect(
      service.updateSubDistributorStatus('caller-1', 'sub-1', 'SUSPENDED' as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('revokes active refresh tokens when suspending', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'sub-1', promotedById: 'caller-1' });
    prisma.user.update.mockResolvedValue({ id: 'sub-1', status: 'SUSPENDED' });

    await service.updateSubDistributorStatus('caller-1', 'sub-1', 'SUSPENDED' as never);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'sub-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('does not revoke refresh tokens when reactivating to ACTIVE', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'sub-1', promotedById: 'caller-1' });
    prisma.user.update.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });

    await service.updateSubDistributorStatus('caller-1', 'sub-1', 'ACTIVE' as never);

    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('DistributorsService.adjustSubDistributorWallet', () => {
  it("404s when the target is not the caller's own sub-distributor", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      promotedById: 'someone-else',
      wallet: null,
    });
    await expect(
      service.adjustSubDistributorWallet('caller-1', 'sub-1', {
        amount: 100,
        reference: 'test',
        otpRequestId: 'otp-1',
        code: '123456',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires otpRequestId and code', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      promotedById: 'caller-1',
      wallet: { id: 'wallet-1' },
    });
    await expect(
      service.adjustSubDistributorWallet('caller-1', 'sub-1', { amount: 100, reference: 'test' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a debit that would take the balance below zero (atomic guard, no partial write)', async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      promotedById: 'caller-1',
      wallet: { id: 'wallet-1' },
    });
    prisma.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.adjustSubDistributorWallet('caller-1', 'sub-1', {
        amount: -100,
        reference: 'debit',
        otpRequestId: 'otp-1',
        code: '123456',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(otp.verify).toHaveBeenCalled();
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'wallet-1',
        balance: { gte: expect.objectContaining({ d: expect.anything() }) },
      },
      data: { balance: { increment: expect.objectContaining({ d: expect.anything() }) } },
    });
  });

  it('credits a positive amount without a balance floor check', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      promotedById: 'caller-1',
      wallet: { id: 'wallet-1' },
    });
    prisma.ledgerEntry.create.mockResolvedValue({
      id: 'entry-1',
      reference: 'credit',
      createdAt: new Date(),
    });

    const result = await service.adjustSubDistributorWallet('caller-1', 'sub-1', {
      amount: 250,
      reference: 'credit',
      otpRequestId: 'otp-1',
      code: '123456',
    });

    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: { increment: expect.objectContaining({ d: expect.anything() }) } },
    });
    expect(result.amount).toBe('250');
  });
});

describe('DistributorsService.requestSubDistributorAdjustmentOtp', () => {
  it('emails the OTP when the caller has no verified phone', async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'caller-1',
      email: 'caller@example.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'sub-1', promotedById: 'caller-1' });

    await service.requestSubDistributorAdjustmentOtp('caller-1', 'sub-1', {
      amount: 100,
      reference: 'bonus',
    });

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'caller-1',
      'SUB_DISTRIBUTOR_ADJUSTMENT',
      'caller@example.com',
      expect.any(String),
      'EMAIL',
    );
  });

  it('prefers SMS to a verified phone number', async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'caller-1',
      email: 'caller@example.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'sub-1', promotedById: 'caller-1' });

    await service.requestSubDistributorAdjustmentOtp('caller-1', 'sub-1', {
      amount: 100,
      reference: 'bonus',
    });

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'caller-1',
      'SUB_DISTRIBUTOR_ADJUSTMENT',
      '+15551234567',
      expect.any(String),
      'SMS',
    );
  });
});
