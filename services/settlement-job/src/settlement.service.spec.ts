jest.mock('@dialectiva/db', () => {
  const actual = jest.requireActual('@dialectiva/db');
  return {
    ...actual,
    computeTrainingPayout: jest.fn(() => ({ toNumber: () => 1 })),
    creditTrainingPayoutOps: jest.fn().mockResolvedValue({
      ops: [],
      result: { referrerUserId: null, referralPayoutBonus: '0' },
    }),
    mintTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
  };
});

import { SettlementService } from './settlement.service';
import { mintTrainingPayoutOps } from '@dialectiva/db';

/**
 * Covers the bug this file fixes: resolveTimedOutScoring used to score AND
 * settle a timed-out (noFailOnTrainEnabled) row in the same instant, bypassing
 * settlementDelayMinutes entirely. It must now only move the row to SCORED --
 * the normal settleWordRecordings delay-respecting pass is what actually pays
 * out, on a later run once the delay has elapsed.
 */
describe('SettlementService resolveTimedOutScoring', () => {
  function buildPrismaMock() {
    const mock: any = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({
          scoringSlaMinutes: 20,
          noFailOnTrainEnabled: true,
          minScoreRange: { toNumber: () => 10 },
          maxScoreRange: { toNumber: () => 30 },
        }),
      },
      wordRecording: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'rec-1', userId: 'user-1', tokensSpent: { toNumber: () => 1 } },
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
    };
    return mock;
  }

  it('moves a timed-out word recording to SCORED without crediting payout or settling it', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const result = await service.resolveTimedOutScoring();

    expect(result.scoredCount).toBe(1);
    expect(result.refundedCount).toBe(0);

    // Claimed as EXPIRED first (unblocks the scoring race).
    expect(prisma.wordRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', status: 'PENDING', refundedAt: null },
      data: { status: 'EXPIRED', refundedAt: expect.any(Date) },
    });

    // Then moved to SCORED (not SETTLED) with no payoutTokenAmount/settledAt --
    // that's the whole fix. It must wait for settleWordRecordings to pick it up.
    expect(prisma.wordRecording.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: expect.objectContaining({ status: 'SCORED', scoredAt: expect.any(Date) }),
    });
    const updateArgs = prisma.wordRecording.update.mock.calls[0][0];
    expect(updateArgs.data).not.toHaveProperty('settledAt');
    expect(updateArgs.data).not.toHaveProperty('payoutTokenAmount');

    // No payout credited, no lock released -- settleWordRecordings does that later.
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
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const result = await service.resolveTimedOutScoring();

    expect(result.scoredCount).toBe(0);
    expect(result.refundedCount).toBe(1);
    expect(prisma.wordRecording.update).not.toHaveBeenCalled();
  });
});

/**
 * Covers a real production bug: refundStuckWordRecordings used to set only
 * refundedAt, never status, leaving the row at PENDING forever -- and since
 * both this sweep and resolveTimedOutScoring filter on refundedAt: null,
 * once claimed it became invisible to every future settlement-job run,
 * permanently stuck (confirmed live: 4,396 ENGLISH_TO_DIALECT rows stuck
 * PENDING in production, ~4,311 of them already refunded and orphaned).
 * The row must now move to EXPIRED in the same atomic claim, matching
 * resolveTimedOutScoring's terminal-state convention.
 */
describe('SettlementService refundStuckWordRecordings', () => {
  function buildPrismaMock() {
    const mock: any = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({
          wordStuckTimeoutMinutes: 60,
          noFailOnTrainEnabled: false,
          minScoreRange: { toNumber: () => 10 },
          maxScoreRange: { toNumber: () => 30 },
        }),
      },
      wordRecording: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'rec-1', userId: 'user-1', tokensSpent: { toNumber: () => 1 } },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        // Type-aware: a TASK_LOCK exists but no TASK_REFUND, i.e. the stake
        // is still held -- isStakeStillLocked() -> true.
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.type === 'TASK_REFUND' ? null : { id: 'lock-1' }),
        ),
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
    };
    return mock;
  }

  it('claims the row as EXPIRED (not just refundedAt) so it reaches a terminal state', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const refundedCount = await service.refundStuckWordRecordings();

    expect(refundedCount).toBe(1);
    expect(prisma.wordRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', refundedAt: null },
      data: { status: 'EXPIRED', refundedAt: expect.any(Date) },
    });
    // Guarded on lockedBalance so a stake released elsewhere between the
    // check and this write can't push the balance negative.
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'wallet-1', lockedBalance: { gte: expect.anything() } },
      data: { lockedBalance: { decrement: expect.anything() }, balance: { increment: expect.anything() } },
    });
  });

  // Regression: the lock check used to ask "was a TASK_LOCK ever written"
  // rather than "is the stake still held", so a row that one sweep had
  // already refunded could have its lock released a second time by another.
  // That decrement writes no ledger row of its own, so it was invisible to
  // the wallet/ledger reconciliation while quietly driving lockedBalance
  // negative -- 51,132 recordings and ~4.9k DL of phantom release in
  // production before it was found.
  it('does not release the lock again once a TASK_REFUND already returned the stake', async () => {
    const prisma = buildPrismaMock();
    prisma.ledgerEntry.findFirst.mockImplementation(({ where }: any) =>
      // Both a lock AND a refund exist: the stake is already back.
      Promise.resolve({ id: where?.type === 'TASK_REFUND' ? 'refund-1' : 'lock-1' }),
    );
    const service = new SettlementService(prisma as never, {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    await service.refundStuckWordRecordings();

    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('skips a row another concurrent run already claimed', async () => {
    const prisma = buildPrismaMock();
    prisma.wordRecording.updateMany.mockResolvedValue({ count: 0 });
    const service = new SettlementService(prisma as never, {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const refundedCount = await service.refundStuckWordRecordings();

    expect(refundedCount).toBe(0);
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
  });

  // Regression: a thin-pool dialect (too few trainers to ever find a peer
  // reverse-validator) had noFailOnTrainEnabled silently do nothing for its
  // ENGLISH_TO_DIALECT submissions, because this sweep always claimed the
  // row and bare-refunded it before resolveTimedOutScoring -- the sweep
  // that actually respects noFailOnTrainEnabled -- ever got a turn.
  it('scores with a synthetic score instead of refunding when noFailOnTrainEnabled is on', async () => {
    const prisma = buildPrismaMock();
    prisma.platformSettings.upsert.mockResolvedValue({
      wordStuckTimeoutMinutes: 60,
      noFailOnTrainEnabled: true,
      minScoreRange: { toNumber: () => 10 },
      maxScoreRange: { toNumber: () => 30 },
    });
    const service = new SettlementService(prisma as never, {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const resolvedCount = await service.refundStuckWordRecordings();

    expect(resolvedCount).toBe(1);
    expect(prisma.wordRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', refundedAt: null },
      data: { status: 'EXPIRED', refundedAt: expect.any(Date) },
    });
    expect(prisma.wordRecording.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: expect.objectContaining({ status: 'SCORED', scoredAt: expect.any(Date) }),
    });
    // No refund/lock-release -- the trainer keeps the payout path instead.
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
  });
});

describe('SettlementService settlement state', () => {
  function buildPrismaMock() {
    const mock: any = {
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
      trainingPayoutClaim: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      wallet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // Supports both Prisma transaction forms: an array of operations and
      // an interactive callback (which receives a tx client).
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(mock) : Promise.all(arg),
      ),
    };
    return mock;
  }

  const qualityWeights = { consensus: 100, noise: 0, quality: 0, liveness: 0 };
  const scoreRange = { min: 0, max: 100 };

  it('marks a settled word recording as SETTLED with its payout timestamp', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // mintingPaused: true -- this test only covers the legacy Wallet credit
    // path, not Tokenomics minting (see the "mints into Tokenomics" tests
    // below for that).
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

  // Regression: this release consumes the stake rather than returning it, so
  // it writes no ledger row of its own -- meaning an over-release is
  // invisible to wallet/ledger reconciliation and silently drives
  // lockedBalance negative. The gte guard makes the write itself incapable
  // of that, independent of whatever the isStakeStillLocked read decided.
  it('guards the lock release so it can never drive lockedBalance negative', async () => {
    const prisma = buildPrismaMock();
    // A TASK_LOCK exists and no TASK_REFUND has returned it, so the stake is
    // still held and the release genuinely runs.
    prisma.ledgerEntry.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.type === 'TASK_REFUND' ? null : { id: 'lock-1' }),
    );
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0, true);

    expect(prisma.wallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          lockedBalance: { gte: expect.anything() },
        }),
      }),
    );
  });

  it('mints into the Tokenomics ledger alongside the legacy payout when minting is not paused', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);
    (mintTrainingPayoutOps as jest.Mock).mockClear();

    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0, false);

    expect(mintTrainingPayoutOps).toHaveBeenCalledWith(
      prisma,
      'user-1',
      expect.anything(),
      'recording-1',
    );
  });

  it('atomically claims a trainer source before crediting its training payout', async () => {
    const prisma = buildPrismaMock();
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'recording-source-1',
        userId: 'user-1',
        wordId: 'word-1',
        sentenceId: null,
        tokensSpent: { toNumber: () => 5 },
        rawScore: null,
        score: { toNumber: () => 80 },
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
      },
    ]);
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn() } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0, true);

    expect(prisma.trainingPayoutClaim.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', sourceKey: 'word:word-1', recordingId: 'recording-source-1' },
    });
  });

  it('skips minting into the Tokenomics ledger when minting is paused, but still pays the trainer', async () => {
    const prisma = buildPrismaMock();
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);
    (mintTrainingPayoutOps as jest.Mock).mockClear();

    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0, true);

    expect(mintTrainingPayoutOps).not.toHaveBeenCalled();
    expect(prisma.wordRecording.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SETTLED' }) }),
    );
  });

  it('settles a Sentence-sourced word recording identically to a Word-sourced one', async () => {
    const prisma = buildPrismaMock();
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'recording-sentence-1',
        userId: 'user-1',
        tokensSpent: { toNumber: () => 5 },
        rawScore: null,
        score: { toNumber: () => 80 },
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
      },
    ]);
    const service = new SettlementService(prisma as never, { deleteObject: jest.fn().mockResolvedValue(undefined) } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    await service.settleWordRecordings(1, false, qualityWeights, 0, scoreRange, 0, true);

    expect(prisma.wordRecording.update).toHaveBeenCalledWith({
      where: { id: 'recording-sentence-1' },
      data: expect.objectContaining({ status: 'SETTLED' }),
    });
  });
});

/**
 * Covers the "reject and delete... refund exact DL" feature: REJECTED
 * WordRecording rows (quality-gate-worker's hard prefilter) get their
 * locked tokens refunded AND their Spaces audio deleted synchronously in
 * the same settlement-job pass, rather than waiting on
 * audio-retention-job's delayed sweep.
 */
describe('SettlementService rejected-record refund + immediate audio delete', () => {
  function buildPrismaMock(overrides: { wordRecordings?: unknown[] }) {
    const mock: any = {
      wordRecording: {
        findMany: jest.fn().mockResolvedValue(overrides.wordRecordings ?? []),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        // Type-aware: a TASK_LOCK exists but no TASK_REFUND, i.e. the stake
        // is still held -- isStakeStillLocked() -> true.
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.type === 'TASK_REFUND' ? null : { id: 'lock-1' }),
        ),
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
    };
    return mock;
  }

  it('refunds a rejected word recording without touching its audio object', async () => {
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
    const service = new SettlementService(prisma as never, { deleteObject } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedWordRecordings();

    expect(count).toBe(1);
    expect(prisma.wordRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'wr-rejected-1', refundedAt: null },
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
    // A rejected recording's audio is never deleted here -- see
    // refundRejectedWordRecordings' doc comment. A wrong rejection (bad
    // config, a scoring bug) must stay recoverable.
    expect(deleteObject).not.toHaveBeenCalled();
    expect(prisma.wordRecording.update).not.toHaveBeenCalled();
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
    const service = new SettlementService(prisma as never, { deleteObject } as never, { notifyReferralPayoutBonus: jest.fn().mockResolvedValue(undefined) } as never);

    // @ts-expect-error -- private method under test
    const count = await service.refundRejectedWordRecordings();

    expect(count).toBe(0);
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

/**
 * Regression, caught live in production: settleDuplicateSourceWithoutReward
 * returns a repeat submission's stake instead of paying a reward, but it
 * only checked that a TASK_LOCK existed -- never whether that stake had
 * already been returned. A row refunded by an earlier sweep (yesterday's
 * stuck-timeout pass) then settled today wrote a SECOND TASK_REFUND: the
 * trainer was credited twice and lockedBalance was decremented for tokens
 * that were no longer there, driving wallets negative at ~0.1 DL a time.
 */
describe('SettlementService.settleDuplicateSourceWithoutReward', () => {
  function buildPrismaMock(alreadyRefunded: boolean) {
    const mock: any = {
      wordRecording: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ledgerEntry: {
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            where?.type === 'TASK_REFUND'
              ? alreadyRefunded
                ? { id: 'refund-1' }
                : null
              : { id: 'lock-1' },
          ),
        ),
        create: jest.fn().mockResolvedValue({}),
      },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'user-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(mock) : Promise.all(arg),
      ),
    };
    return mock;
  }

  const recording = { id: 'rec-dup', userId: 'user-1', tokensSpent: { toNumber: () => 0.1 } };

  function makeService(prisma: any) {
    return new SettlementService(prisma as never, { deleteObject: jest.fn() } as never, {
      notifyReferralPayoutBonus: jest.fn(),
    } as never);
  }

  it('returns the stake once when it is still held', async () => {
    const prisma = buildPrismaMock(false);
    // @ts-expect-error -- private method under test
    await makeService(prisma).settleDuplicateSourceWithoutReward(recording);

    expect(prisma.wallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockedBalance: { gte: recording.tokensSpent } }),
      }),
    );
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'TASK_REFUND' }) }),
    );
  });

  it('does NOT refund again when an earlier sweep already returned the stake', async () => {
    const prisma = buildPrismaMock(true);
    // @ts-expect-error -- private method under test
    await makeService(prisma).settleDuplicateSourceWithoutReward(recording);

    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('writes no ledger row when the guarded release matches nothing', async () => {
    const prisma = buildPrismaMock(false);
    prisma.wallet.updateMany.mockResolvedValue({ count: 0 });

    // @ts-expect-error -- private method under test
    await makeService(prisma).settleDuplicateSourceWithoutReward(recording);

    // A TASK_REFUND with no matching wallet movement would break the
    // wallet-vs-ledger reconciliation outright.
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
