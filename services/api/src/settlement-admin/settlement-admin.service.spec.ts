jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditTrainingPayoutOps: jest.fn().mockResolvedValue({
    ops: [],
    result: { referrerUserId: null, referralPayoutBonus: '0' },
  }),
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
    prisma.user = { findUnique: jest.fn().mockResolvedValue(null) };
    const sms = { sendTransactional: jest.fn().mockResolvedValue({ provider: 'termii' }) };
    service = new SettlementAdminService(prisma, settings, tokenomics, sms as never);
  });

  describe('listUnsettled', () => {
    it('lists word recordings, flagging rows still inside the delay window', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      const now = Date.now();
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-old',
          status: 'SCORED',
          tokensSpent: decimal(5),
          score: decimal(80),
          scoredAt: new Date(now - 2 * 60 * 60 * 1000), // 2h ago -- past a 60min delay
          createdAt: new Date(now - 2 * 60 * 60 * 1000),
          user: { id: 'user-1', email: 'a@x.com', firstName: null, lastName: null },
        },
        {
          id: 'rec-recent',
          status: 'SCORED',
          tokensSpent: decimal(5),
          score: decimal(80),
          scoredAt: new Date(now - 5 * 60 * 1000), // 5min ago -- inside a 60min delay
          createdAt: new Date(now - 5 * 60 * 1000),
          user: { id: 'user-2', email: 'b@x.com', firstName: null, lastName: null },
        },
      ]);

      const result = await service.listUnsettled({ page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      const old = result.items.find((item) => item.id === 'rec-old')!;
      const recent = result.items.find((item) => item.id === 'rec-recent')!;
      expect(old.pendingDelay).toBe(false);
      expect(recent.pendingDelay).toBe(true);
      expect(result.stuckCount).toBe(1);
    });

    it("scopes the query by userId when provided, for a single trainer's pending-scoring view", async () => {
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.listUnsettled({ page: 1, pageSize: 20, userId: 'user-1' });

      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            status: { in: ['PENDING', 'SCORED'] },
          }),
        }),
      );
    });

    it('includes PENDING rows (not yet scored) for visibility, distinct from SCORED', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-pending',
          status: 'PENDING',
          tokensSpent: decimal(5),
          score: null,
          scoredAt: null,
          createdAt: new Date(),
          user: { id: 'user-1', email: 'a@x.com', firstName: null, lastName: null },
        },
      ]);

      const result = await service.listUnsettled({ page: 1, pageSize: 20 });

      expect(result.items[0].status).toBe('PENDING');
      // A PENDING row has no score yet, so it never counts toward "stuck"
      // (settleable-but-not-settled) even outside any delay window.
      expect(result.stuckCount).toBe(0);
    });
  });

  describe('settleOne', () => {
    it('settles a word recording, crediting payout and minting when not paused', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.settleOne('rec-1', false);

      expect(creditTrainingPayoutOps).toHaveBeenCalledWith(
        prisma,
        'user-1',
        expect.anything(),
        'rec-1',
      );
      expect(mintTrainingPayoutOps).toHaveBeenCalledWith(
        prisma,
        'user-1',
        expect.anything(),
        'rec-1',
      );
      expect(prisma.wordRecording.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-1' },
          data: expect.objectContaining({ status: 'SETTLED', settledAt: expect.any(Date) }),
        }),
      );
      expect(result.id).toBe('rec-1');
    });

    it('skips minting when Tokenomics minting is paused, but still credits the legacy payout', async () => {
      tokenomics.isMintingPaused.mockResolvedValue(true);
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      await service.settleOne('rec-1', false);

      expect(creditTrainingPayoutOps).toHaveBeenCalled();
      expect(mintTrainingPayoutOps).not.toHaveBeenCalled();
    });

    it('refuses to settle a row still inside the delay window without force', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      await expect(service.settleOne('rec-1', false)).rejects.toThrow('delay window');
      expect(prisma.wordRecording.update).not.toHaveBeenCalled();
    });

    it('allows settling a row inside the delay window when force is set', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'SCORED',
        settledAt: null,
        userId: 'user-1',
        tokensSpent: decimal(5),
        rawScore: null,
        score: decimal(80),
        noiseScore: null,
        qualityScore: null,
        livenessScore: null,
        asrMatchScore: null,
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.settleOne('rec-1', true);
      expect(result.id).toBe('rec-1');
      expect(prisma.wordRecording.update).toHaveBeenCalled();
    });

    it('refuses to re-settle a row that is no longer SCORED (already settled by the cron job)', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'SETTLED',
        settledAt: new Date(),
        userId: 'user-1',
        tokensSpent: decimal(5),
        score: decimal(80),
        scoredAt: new Date(),
        createdAt: new Date(),
      });

      await expect(service.settleOne('rec-1', false)).rejects.toThrow('not currently eligible');
    });

    it('settles a Sentence-sourced word recording the same as a Word-sourced one', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'rec-sentence-1',
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

      const result = await service.settleOne('rec-sentence-1', false);
      expect(result.id).toBe('rec-sentence-1');
      expect(prisma.wordRecording.update).toHaveBeenCalled();
    });
  });

  describe('settleAll', () => {
    it('settles every eligible row, skipping delay-window rows unless forced, and continues past a failure', async () => {
      settings.getSettlementDelayMinutes.mockResolvedValue(60);
      const now = Date.now();
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-due',
          status: 'SCORED',
          userId: 'user-1',
          tokensSpent: decimal(5),
          rawScore: null,
          score: decimal(80),
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          asrMatchScore: null,
          scoredAt: new Date(now - 2 * 60 * 60 * 1000),
          createdAt: new Date(now - 2 * 60 * 60 * 1000),
        },
        {
          id: 'rec-pending',
          status: 'SCORED',
          userId: 'user-2',
          tokensSpent: decimal(5),
          rawScore: null,
          score: decimal(80),
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          asrMatchScore: null,
          scoredAt: new Date(now - 5 * 60 * 1000),
          createdAt: new Date(now - 5 * 60 * 1000),
        },
      ]);
      prisma.wordRecording.findUnique.mockImplementation(
        ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve({
            id,
            status: 'SCORED',
            settledAt: null,
            userId: id === 'rec-due' ? 'user-1' : 'user-2',
            tokensSpent: decimal(5),
            rawScore: null,
            score: decimal(80),
            noiseScore: null,
            qualityScore: null,
            livenessScore: null,
            asrMatchScore: null,
            scoredAt: new Date(now - 2 * 60 * 60 * 1000),
            createdAt: new Date(now - 2 * 60 * 60 * 1000),
          }),
      );

      const result = await service.settleAll(false);

      expect(result.settledCount).toBe(1);
      expect(result.skippedDelayCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('skips PENDING rows silently rather than counting them as failures', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-still-pending',
          status: 'PENDING',
          userId: 'user-1',
          tokensSpent: decimal(5),
          scoredAt: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.settleAll(false);

      expect(result.settledCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(prisma.wordRecording.findUnique).not.toHaveBeenCalled();
    });
  });
});
