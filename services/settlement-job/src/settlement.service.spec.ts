jest.mock('@dialectiva/db', () => {
  const actual = jest.requireActual('@dialectiva/db');
  return {
    ...actual,
    computeTrainingPayout: jest.fn(() => ({ toNumber: () => 1 })),
    creditTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
  };
});

import { SettlementService } from './settlement.service';

/**
 * Covers the bug this file fixes: resolveTimedOutScoring used to score AND
 * settle a timed-out (noFailOnTrainEnabled) row in the same instant, bypassing
 * settlementDelayMinutes entirely. It must now only move the row to SCORED --
 * the normal settleSubmissions/settleWordRecordings delay-respecting pass is
 * what actually pays out, on a later run once the delay has elapsed.
 */
describe('SettlementService resolveTimedOutScoring', () => {
  function buildPrismaMock() {
    return {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({
          scoringSlaMinutes: 20,
          noFailOnTrainEnabled: true,
          minScoreRange: { toNumber: () => 10 },
          maxScoreRange: { toNumber: () => 30 },
        }),
      },
      submission: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'sub-1', userId: 'user-1', tokensSpent: { toNumber: () => 1 } },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      wordRecording: {
        findMany: jest.fn().mockResolvedValue([]),
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
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
  }

  it('moves a timed-out submission to SCORED without crediting payout or settling it', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never);

    // @ts-expect-error -- private method under test
    const result = await service.resolveTimedOutScoring();

    expect(result.scoredCount).toBe(1);
    expect(result.refundedCount).toBe(0);

    // Claimed as EXPIRED first (unblocks the ASR/consensus race).
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', status: { in: ['PENDING', 'TRANSCRIBED'] }, refundedAt: null },
      data: { status: 'EXPIRED', refundedAt: expect.any(Date) },
    });

    // Then moved to SCORED (not SETTLED) with no payoutTokenAmount/settledAt --
    // that's the whole fix. It must wait for settleSubmissions to pick it up.
    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({ status: 'SCORED', scoredAt: expect.any(Date) }),
    });
    const updateArgs = prisma.submission.update.mock.calls[0][0];
    expect(updateArgs.data).not.toHaveProperty('settledAt');
    expect(updateArgs.data).not.toHaveProperty('payoutTokenAmount');

    // No payout credited, no lock released -- settleSubmissions does that later.
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refunds instead of scoring when noFailOnTrainEnabled is off', async () => {
    const prisma = buildPrismaMock();
    prisma.platformSettings.upsert.mockResolvedValue({
      scoringSlaMinutes: 20,
      noFailOnTrainEnabled: false,
      minScoreRange: { toNumber: () => 10 },
      maxScoreRange: { toNumber: () => 30 },
    });
    const service = new SettlementService(prisma as never);

    // @ts-expect-error -- private method under test
    const result = await service.resolveTimedOutScoring();

    expect(result.scoredCount).toBe(0);
    expect(result.refundedCount).toBe(1);
    expect(prisma.submission.update).not.toHaveBeenCalled();
  });
});

describe('SettlementService settlement state', () => {
  function buildPrismaMock() {
    return {
      submission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            userId: 'user-1',
            tokensSpent: { toNumber: () => 5 },
            rawScore: null,
            score: { toNumber: () => 80 },
            noiseScore: null,
            qualityScore: null,
            livenessScore: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      wordRecording: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'recording-1',
            userId: 'user-1',
            tokensSpent: { toNumber: () => 5 },
            rawScore: null,
            score: { toNumber: () => 80 },
            noiseScore: null,
            qualityScore: null,
            livenessScore: null,
            asrMatchScore: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wallet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  const qualityWeights = { consensus: 100, noise: 0, quality: 0, liveness: 0 };
  const scoreRange = { min: 0, max: 100 };

  it('marks a settled submission as SETTLED with its payout timestamp', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never);

    // @ts-expect-error -- private method under test
    await service.settleSubmissions(1, false, qualityWeights, scoreRange, 0);

    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        status: 'SETTLED',
        payoutTokenAmount: expect.anything(),
        settledAt: expect.any(Date),
      }),
    });
  });

  it('marks a settled word recording as SETTLED with its payout timestamp', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never);

    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0);

    expect(prisma.wordRecording.update).toHaveBeenCalledWith({
      where: { id: 'recording-1' },
      data: expect.objectContaining({
        status: 'SETTLED',
        payoutTokenAmount: expect.anything(),
        settledAt: expect.any(Date),
      }),
    });
  });
});
