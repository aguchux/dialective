jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
  mintTrainingPayoutOps: jest.fn().mockResolvedValue({ ops: [] }),
}));

import { Prisma, creditTrainingPayoutOps, mintTrainingPayoutOps } from '@dialectiva/db';
import { SettlementAdminService } from './settlement-admin.service';

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

describe('SettlementAdminService', () => {
  let prisma: any;
  let settings: any;
  let tokenomics: any;
  let service: SettlementAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      submission: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      wordRecording: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    settings = {
      getSettlementDelayMinutes: jest.fn().mockResolvedValue(0),
      getTrainingPayoutBonusCapMultiple: jest.fn().mockResolvedValue(1),
      isQualityGateEnabled: jest.fn().mockResolvedValue(false),
      getQualityWeights: jest
        .fn()
        .mockResolvedValue({ consensus: 100, noise: 0, quality: 0, liveness: 0 }),
      getAsrMatchWeight: jest.fn().mockResolvedValue(0),
      getScoreRange: jest.fn().mockResolvedValue({ min: 0, max: 100 }),
    };
    tokenomics = { isMintingPaused: jest.fn().mockResolvedValue(false) };
    service = new SettlementAdminService(prisma, settings, tokenomics);
  });

  describe('listUnsettled', () => {
    it('merges submissions and word recordings, flagging rows still inside the delay window', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      const now = Date.now();
      prisma.submission.findMany.mockResolvedValue([
        {
          id: 'sub-old',
          tokensSpent: decimal(5),
          score: decimal(80),
          scoredAt: new Date(now - 2 * 60 * 60 * 1000), // 2h ago -- past a 60min delay
          createdAt: new Date(now - 2 * 60 * 60 * 1000),
          user: { id: 'user-1', email: 'a@x.com', firstName: null, lastName: null },
        },
        {
          id: 'sub-recent',
          tokensSpent: decimal(5),
          score: decimal(80),
          scoredAt: new Date(now - 5 * 60 * 1000), // 5min ago -- inside a 60min delay
          createdAt: new Date(now - 5 * 60 * 1000),
          user: { id: 'user-2', email: 'b@x.com', firstName: null, lastName: null },
        },
      ]);

      const result = await service.listUnsettled({ page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      const old = result.items.find((item) => item.id === 'sub-old')!;
      const recent = result.items.find((item) => item.id === 'sub-recent')!;
      expect(old.pendingDelay).toBe(false);
      expect(recent.pendingDelay).toBe(true);
      expect(result.stuckCount).toBe(1);
    });
  });

  describe('settleOne', () => {
    it('settles a submission, crediting payout and minting when not paused', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.settleOne('submission', 'sub-1', false);

      expect(creditTrainingPayoutOps).toHaveBeenCalledWith(prisma, 'user-1', expect.anything(), 'sub-1');
      expect(mintTrainingPayoutOps).toHaveBeenCalledWith(prisma, 'user-1', expect.anything(), 'sub-1');
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({ status: 'SETTLED', settledAt: expect.any(Date) }),
        }),
      );
      expect(result.id).toBe('sub-1');
    });

    it('skips minting when Tokenomics minting is paused, but still credits the legacy payout', async () => {
      tokenomics.isMintingPaused.mockResolvedValue(true);
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      await service.settleOne('submission', 'sub-1', false);

      expect(creditTrainingPayoutOps).toHaveBeenCalled();
      expect(mintTrainingPayoutOps).not.toHaveBeenCalled();
    });

    it('refuses to settle a row still inside the delay window without force', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      await expect(service.settleOne('submission', 'sub-1', false)).rejects.toThrow(
        'delay window',
      );
      expect(prisma.submission.update).not.toHaveBeenCalled();
    });

    it('allows settling a row inside the delay window when force is set', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.settleOne('submission', 'sub-1', true);
      expect(result.id).toBe('sub-1');
      expect(prisma.submission.update).toHaveBeenCalled();
    });

    it('refuses to re-settle a row that is no longer SCORED (already settled by the cron job)', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'SETTLED',
        settledAt: new Date(),
        userId: 'user-1',
        tokensSpent: decimal(5),
        score: decimal(80),
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      await expect(service.settleOne('submission', 'sub-1', false)).rejects.toThrow(
        'not currently eligible',
      );
    });

    it('settles a word recording via the same path', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(3),
        rawScore: null,
        score: decimal(90),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.settleOne('word', 'rec-1', false);
      expect(result.id).toBe('rec-1');
      expect(prisma.wordRecording.update).toHaveBeenCalled();
    });
  });

  describe('settleAll', () => {
    it('settles every eligible row, skipping delay-window rows unless forced, and continues past a failure', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      const now = Date.now();
      prisma.submission.findMany.mockResolvedValue([
        {
          id: 'sub-due',
          userId: 'user-1',
          tokensSpent: decimal(5),
          rawScore: null,
          score: decimal(80),
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          scoredAt: new Date(now - 2 * 60 * 60 * 1000),
          createdAt: new Date(now - 2 * 60 * 60 * 1000),
        },
        {
          id: 'sub-pending',
          userId: 'user-2',
          tokensSpent: decimal(5),
          rawScore: null,
          score: decimal(80),
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          scoredAt: new Date(now - 5 * 60 * 1000),
          createdAt: new Date(now - 5 * 60 * 1000),
        },
      ]);
      prisma.submission.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve({
          id,
          status: 'SCORED',
          settledAt: null,
          userId: id === 'sub-due' ? 'user-1' : 'user-2',
          tokensSpent: decimal(5),
          rawScore: null,
          score: decimal(80),
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          scoredAt: new Date(now - 2 * 60 * 60 * 1000),
          createdAt: new Date(now - 2 * 60 * 60 * 1000),
        }),
      );

      const result = await service.settleAll('submission', false);

      expect(result.settledCount).toBe(1);
      expect(result.skippedDelayCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });
  });
});
