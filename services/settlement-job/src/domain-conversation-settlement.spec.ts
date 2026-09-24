jest.mock('@dialectiva/db', () => {
  const actual = jest.requireActual('@dialectiva/db');
  return {
    ...actual,
    // Delegates to the real no-loss-plus-bonus formula instead of a fixed
    // stub -- settleDomainConversationRecordings now feeds compositeScore
    // through this exactly like settleWordRecordings does, so the test
    // below needs a real payout number (stake back + score-scaled bonus) to
    // assert against, not a flat 1.
    computeTrainingPayout: jest.fn(actual.computeTrainingPayout),
    creditTrainingPayoutOps: jest.fn().mockResolvedValue({
      ops: [],
      result: { referrerUserId: null, referralPayoutBonus: '0' },
    }),
    mintTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
  };
});

import { Prisma } from '@dialectiva/db';
import { computeDomainConversationCompositeScore, SettlementService } from './settlement.service';

const { Decimal } = Prisma;

describe('computeDomainConversationCompositeScore', () => {
  it('blends noise/quality/liveness by their configured weights', () => {
    const score = computeDomainConversationCompositeScore(
      { toNumber: () => 80 } as never,
      { toNumber: () => 60 } as never,
      { toNumber: () => 100 } as never,
      { noise: 40, quality: 30, liveness: 30 },
    );
    // (80*40 + 60*30 + 100*30) / 100 = (3200 + 1800 + 3000) / 100 = 80
    expect(score).toBeCloseTo(80);
  });

  it('falls back to a neutral 100 for missing scores', () => {
    const score = computeDomainConversationCompositeScore(null, null, null, {
      noise: 40,
      quality: 30,
      liveness: 30,
    });
    expect(score).toBe(100);
  });

  it('returns 100 when all weights are zero', () => {
    const score = computeDomainConversationCompositeScore(
      { toNumber: () => 10 } as never,
      { toNumber: () => 10 } as never,
      { toNumber: () => 10 } as never,
      { noise: 0, quality: 0, liveness: 0 },
    );
    expect(score).toBe(100);
  });
});

describe('SettlementService.settleDomainConversationRecordings', () => {
  function buildPrismaMock(overrides: Record<string, unknown> = {}) {
    const mock: any = {
      domainConversationRecording: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dc-rec-1',
            userId: 'user-1',
            tokensSpent: new Decimal(3),
            noiseScore: { toNumber: () => 90 },
            qualityScore: { toNumber: () => 90 },
            livenessScore: { toNumber: () => 90 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      wallet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'user-1' }),
        create: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'user-1' }),
      },
      // Supports both Prisma transaction forms: an array of operations and
      // an interactive callback (which receives a tx client).
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(mock) : Promise.all(arg),
      ),
      ...overrides,
    };
    return mock;
  }

  function buildService(prisma: unknown) {
    return new SettlementService(
      prisma as never,
      { deleteObject: jest.fn().mockResolvedValue(undefined) } as never,
      { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never,
    );
  }

  it('settles a SCORED row that clears the quality floor, paying out tokensSpent plus a score-scaled bonus', async () => {
    const prisma = buildPrismaMock();
    const service = buildService(prisma);

    // compositeScore = (90*40 + 90*30 + 90*30) / 100 = 90
    // payout = computeTrainingPayout(3, 90, bonusCapMultiple=1) = 3 + 3*0.9*1 = 5.7
    // @ts-expect-error -- private method under test
    const result = await service.settleDomainConversationRecordings(
      1,
      { noise: 40, quality: 30, liveness: 30 },
      50,
      0,
      false,
      true,
    );

    expect(result.settledCount).toBe(1);
    expect(result.totalPayout).toBeCloseTo(5.7);
    expect(prisma.domainConversationRecording.update).toHaveBeenCalledWith({
      where: { id: 'dc-rec-1' },
      data: expect.objectContaining({
        status: 'SETTLED',
        payoutTokenAmount: expect.anything(),
        settledAt: expect.any(Date),
      }),
    });
  });

  it('refunds instead of settling when compositeScore falls below the quality floor', async () => {
    const prisma = buildPrismaMock({
      domainConversationRecording: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dc-rec-2',
            userId: 'user-1',
            tokensSpent: { toNumber: () => 3 },
            noiseScore: { toNumber: () => 10 },
            qualityScore: { toNumber: () => 10 },
            livenessScore: { toNumber: () => 10 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const service = buildService(prisma);

    // @ts-expect-error -- private method under test
    const result = await service.settleDomainConversationRecordings(
      1,
      { noise: 40, quality: 30, liveness: 30 },
      50,
      0,
      false,
      true,
    );

    expect(result.settledCount).toBe(0);
    expect(prisma.domainConversationRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'dc-rec-2', settledAt: null, refundedAt: null },
      data: expect.objectContaining({ status: 'EXPIRED', refundedAt: expect.any(Date) }),
    });
    // No wasLocked ledger entry exists in this mock, so no wallet refund fires.
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('moves a below-floor row off status=SCORED so it is not re-selected by the driving query on the next run', async () => {
    // The driving query (findMany above) filters on {status: 'SCORED',
    // settledAt: null} -- if the refund path left status unchanged, this
    // same row would be re-selected and re-processed forever. Assert the
    // updateMany's `data` actually flips status to a terminal value.
    const prisma = buildPrismaMock({
      domainConversationRecording: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dc-rec-3',
            userId: 'user-1',
            tokensSpent: { toNumber: () => 3 },
            noiseScore: { toNumber: () => 10 },
            qualityScore: { toNumber: () => 10 },
            livenessScore: { toNumber: () => 10 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const service = buildService(prisma);

    // @ts-expect-error -- private method under test
    await service.settleDomainConversationRecordings(
      1,
      { noise: 40, quality: 30, liveness: 30 },
      50,
      0,
      false,
      true,
    );

    const [[{ data }]] = prisma.domainConversationRecording.updateMany.mock.calls;
    expect(data.status).toBe('EXPIRED');
  });

  it('a second overlapping claim on the same below-floor row is a no-op (guarded on refundedAt: null)', async () => {
    const prisma = buildPrismaMock({
      domainConversationRecording: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dc-rec-4',
            userId: 'user-1',
            tokensSpent: { toNumber: () => 3 },
            noiseScore: { toNumber: () => 10 },
            qualityScore: { toNumber: () => 10 },
            livenessScore: { toNumber: () => 10 },
          },
        ]),
        // Simulates a second concurrent run losing the race: refundedAt was
        // already claimed by the first run, so this updateMany matches 0 rows.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const service = buildService(prisma);

    // @ts-expect-error -- private method under test
    const result = await service.settleDomainConversationRecordings(
      1,
      { noise: 40, quality: 30, liveness: 30 },
      50,
      0,
      false,
      true,
    );

    expect(result.settledCount).toBe(0);
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
  });
});

describe('SettlementService.refundRejectedDomainConversationRecordings', () => {
  it('refunds locked tokens for a REJECTED row without deleting its audio', async () => {
    const prisma: any = {
      domainConversationRecording: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dc-rec-3',
            userId: 'user-1',
            tokensSpent: { toNumber: () => 3 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        // Type-aware: a TASK_LOCK exists but no TASK_REFUND, i.e. the stake
        // is still held -- isStakeStillLocked() -> true.
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where?.type === 'TASK_REFUND' ? null : { id: 'lock-1' }),
          ),
        create: jest.fn().mockResolvedValue({}),
      },
      wallet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'user-1' }),
      },
      // Supports both Prisma transaction forms: an array of operations and
      // an interactive callback (which receives a tx client).
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    const service = new SettlementService(
      prisma as never,
      storage as never,
      {
        notifyReferralPayoutBonus: jest.fn(),
      } as never,
    );

    // @ts-expect-error -- private method under test
    const refundedCount = await service.refundRejectedDomainConversationRecordings();

    expect(refundedCount).toBe(1);
    // A wrong rejection (bad config, a scoring bug) must stay recoverable --
    // audio is never deleted from the reject path.
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.domainConversationRecording.update).not.toHaveBeenCalled();
    expect(prisma.wallet.updateMany).toHaveBeenCalled();
  });
});
