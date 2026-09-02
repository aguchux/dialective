jest.mock('@dialectiva/db', () => {
  const actual = jest.requireActual('@dialectiva/db');
  return {
    ...actual,
    computeTrainingPayout: jest.fn(() => ({ toNumber: () => 1 })),
    creditTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
    mintTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
  };
});

import { SettlementService } from './settlement.service';
import { mintTrainingPayoutOps } from '@dialectiva/db';

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
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never);

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
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never);

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
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never);

    // mintingPaused: true -- this test only covers the legacy Wallet credit
    // path, not Tokenomics minting (see the settlement.service.spec.ts
    // "settlement mints into Tokenomics" tests below for that).
    // @ts-expect-error -- private method under test
    await service.settleSubmissions(1, false, qualityWeights, scoreRange, 0, true);

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
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never);

    // mintingPaused: true -- see settleSubmissions test above for why.
    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0, true);

    expect(prisma.wordRecording.update).toHaveBeenCalledWith({
      where: { id: 'recording-1' },
      data: expect.objectContaining({
        status: 'SETTLED',
        payoutTokenAmount: expect.anything(),
        settledAt: expect.any(Date),
      }),
    });
  });

  it('mints into the Tokenomics ledger alongside the legacy payout when minting is not paused', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never);
    (mintTrainingPayoutOps as jest.Mock).mockClear();

    // @ts-expect-error -- private method under test
    await service.settleSubmissions(1, false, qualityWeights, scoreRange, 0, false);

    expect(mintTrainingPayoutOps).toHaveBeenCalledWith(
      prisma,
      'user-1',
      expect.anything(),
      'sub-1',
    );
  });

  it('skips minting into the Tokenomics ledger when minting is paused, but still pays the trainer', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never);
    (mintTrainingPayoutOps as jest.Mock).mockClear();

    // @ts-expect-error -- private method under test
    await service.settleSubmissions(1, false, qualityWeights, scoreRange, 0, true);

    expect(mintTrainingPayoutOps).not.toHaveBeenCalled();
    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SETTLED' }) }),
    );
  });
});

/**
 * Covers the "reject and delete... refund exact DL" feature: REJECTED rows
 * (quality-gate-worker's hard prefilter, both Submission and now
 * WordRecording) get their locked tokens refunded AND their Spaces audio
 * deleted synchronously in the same settlement-job pass, rather than
 * waiting on audio-retention-job's delayed sweep.
 */
describe('SettlementService rejected-record refund + immediate audio delete', () => {
  function buildPrismaMock(overrides: {
    submissions?: unknown[];
    wordRecordings?: unknown[];
  }) {
    return {
      submission: {
        findMany: jest.fn().mockResolvedValue(overrides.submissions ?? []),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      wordRecording: {
        findMany: jest.fn().mockResolvedValue(overrides.wordRecordings ?? []),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ledger-1' }), // wasLocked() -> true
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

  it('refunds a rejected submission and deletes its audio object', async () => {
    const prisma = buildPrismaMock({
      submissions: [
        {
          id: 'sub-rejected-1',
          userId: 'user-1',
          tokensSpent: { toNumber: () => 2 },
          audioBucket: 'dialectiva-submissions',
          audioKey: 'yo/prompt-1/sub-rejected-1.webm',
        },
      ],
    });
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const service = new SettlementService(prisma as never, { deleteObject } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedSubmissions();

    expect(count).toBe(1);
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-rejected-1', refundedAt: null },
      data: { refundedAt: expect.any(Date) },
    });
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lockedBalance: { decrement: { toNumber: expect.any(Function) } },
          balance: { increment: { toNumber: expect.any(Function) } },
        }),
      }),
    );
    expect(deleteObject).toHaveBeenCalledWith(
      'dialectiva-submissions',
      'yo/prompt-1/sub-rejected-1.webm',
    );
    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: 'sub-rejected-1' },
      data: { audioBucket: null, audioKey: null, audioDeletedAt: expect.any(Date) },
    });
  });

  it('refunds a rejected word recording and deletes its audio object', async () => {
    const prisma = buildPrismaMock({
      wordRecordings: [
        {
          id: 'wr-rejected-1',
          userId: 'user-1',
          tokensSpent: { toNumber: () => 1 },
          audioBucket: 'dialectiva-word-recordings',
          audioKey: 'ig/english_to_dialect/prompt-1/wr-rejected-1.webm',
        },
      ],
    });
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const service = new SettlementService(prisma as never, { deleteObject } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedWordRecordings();

    expect(count).toBe(1);
    expect(prisma.wordRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'wr-rejected-1', refundedAt: null },
      data: { refundedAt: expect.any(Date) },
    });
    expect(deleteObject).toHaveBeenCalledWith(
      'dialectiva-word-recordings',
      'ig/english_to_dialect/prompt-1/wr-rejected-1.webm',
    );
    expect(prisma.wordRecording.update).toHaveBeenCalledWith({
      where: { id: 'wr-rejected-1' },
      data: { audioBucket: null, audioKey: null, audioDeletedAt: expect.any(Date) },
    });
  });

  it('does not attempt to delete audio when audioBucket/audioKey are already null (SENTENCE_REBUILD has no audio step)', async () => {
    const prisma = buildPrismaMock({
      wordRecordings: [
        {
          id: 'wr-rejected-2',
          userId: 'user-1',
          tokensSpent: { toNumber: () => 1 },
          audioBucket: null,
          audioKey: null,
        },
      ],
    });
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const service = new SettlementService(prisma as never, { deleteObject } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedWordRecordings();

    expect(count).toBe(1);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(prisma.wordRecording.update).not.toHaveBeenCalled();
  });

  it('still refunds the trainer even when audio deletion fails (Spaces down)', async () => {
    const prisma = buildPrismaMock({
      submissions: [
        {
          id: 'sub-rejected-2',
          userId: 'user-1',
          tokensSpent: { toNumber: () => 2 },
          audioBucket: 'dialectiva-submissions',
          audioKey: 'yo/prompt-1/sub-rejected-2.webm',
        },
      ],
    });
    const deleteObject = jest.fn().mockRejectedValue(new Error('Spaces unavailable'));
    const service = new SettlementService(prisma as never, { deleteObject } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedSubmissions();

    expect(count).toBe(1);
    expect(prisma.wallet.updateMany).toHaveBeenCalled(); // refund still happened
    expect(prisma.submission.update).not.toHaveBeenCalled(); // audioDeletedAt write skipped
  });

  it('skips two overlapping runs from double-refunding the same rejected word recording', async () => {
    const prisma = buildPrismaMock({
      wordRecordings: [
        {
          id: 'wr-rejected-3',
          userId: 'user-1',
          tokensSpent: { toNumber: () => 1 },
          audioBucket: 'dialectiva-word-recordings',
          audioKey: 'ig/english_to_dialect/prompt-1/wr-rejected-3.webm',
        },
      ],
    });
    prisma.wordRecording.updateMany.mockResolvedValue({ count: 0 }); // another run already claimed it
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const service = new SettlementService(prisma as never, { deleteObject } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedWordRecordings();

    expect(count).toBe(0);
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
