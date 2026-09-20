jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  adjustAdminWallet: jest.fn(),
}));

import { adjustAdminWallet } from '@dialectiva/db';
import { AdminRecordingsService } from './admin-recordings.service';

describe('AdminRecordingsService', () => {
  let prisma: any;
  let storage: any;
  let otp: any;
  let settings: any;
  let asrRegistry: any;
  let service: AdminRecordingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      wordRecording: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' }),
      },
    };
    storage = {
      createPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://signed.example/audio' }),
    };
    otp = {
      issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'req-1' }),
      verify: jest.fn().mockResolvedValue(undefined),
    };
    settings = { isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false) };
    asrRegistry = {
      resolve: jest.fn((tag: string) =>
        tag === 'yo'
          ? { engine: 'whisper', stream: 'asr-jobs-whisper', checkpoint: 'NCAIR1/Yoruba-ASR' }
          : undefined,
      ),
    };
    service = new AdminRecordingsService(prisma, storage, otp, settings, asrRegistry);
  });

  /**
   * An unmapped dialect fails silently -- no asr_stream, no worker, no
   * transcript, no error. This view is the thing that makes that visible,
   * so it has to be right about which dialects are actually covered.
   */
  describe('asrCoverage', () => {
    function withDialects(
      totals: { dialectTag: string; n: number }[],
      transcribed: { dialectTag: string; n: number }[],
    ) {
      prisma.wordRecording.groupBy = jest
        .fn()
        .mockResolvedValueOnce(totals.map((t) => ({ dialectTag: t.dialectTag, _count: { _all: t.n } })))
        .mockResolvedValueOnce(
          transcribed.map((t) => ({ dialectTag: t.dialectTag, _count: { _all: t.n } })),
        );
      prisma.dialect = {
        findMany: jest.fn().mockResolvedValue([
          { tag: 'yo', name: 'Yoruba' },
          { tag: 'ibb', name: 'Ibibio' },
        ]),
      };
    }

    it('flags a dialect with recordings but no registry entry', async () => {
      withDialects([{ dialectTag: 'ibb', n: 11412 }], []);
      const [row] = await service.asrCoverage();
      expect(row).toMatchObject({
        dialectTag: 'ibb',
        name: 'Ibibio',
        recordings: 11412,
        transcribed: 0,
        coveragePercent: 0,
        mapped: false,
        checkpoint: null,
      });
    });

    it('reports the checkpoint for a mapped dialect', async () => {
      withDialects([{ dialectTag: 'yo', n: 100 }], [{ dialectTag: 'yo', n: 94 }]);
      const [row] = await service.asrCoverage();
      expect(row).toMatchObject({
        dialectTag: 'yo',
        mapped: true,
        engine: 'whisper',
        checkpoint: 'NCAIR1/Yoruba-ASR',
        coveragePercent: 94,
      });
    });

    it('sorts by volume so the biggest hole is first', async () => {
      withDialects(
        [
          { dialectTag: 'yo', n: 100 },
          { dialectTag: 'ibb', n: 11412 },
        ],
        [{ dialectTag: 'yo', n: 94 }],
      );
      const rows = await service.asrCoverage();
      expect(rows.map((r: { dialectTag: string }) => r.dialectTag)).toEqual(['ibb', 'yo']);
    });

    it('counts real transcripts, not just a registry entry', async () => {
      // A mapped dialect whose checkpoint fails to load looks identical to
      // an unmapped one from the trainer's side -- this view must show it.
      withDialects([{ dialectTag: 'yo', n: 500 }], []);
      const [row] = await service.asrCoverage();
      expect(row.mapped).toBe(true);
      expect(row.coveragePercent).toBe(0);
    });
  });

  describe('listForTrainer', () => {
    it('lists word recordings for a trainer, newest first, DB-paginated', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'word-new',
          createdAt: new Date('2026-01-02'),
          direction: 'ENGLISH_TO_DIALECT',
          dialectTag: 'ig',
          translationText: 'nnọọ',
          word: { text: 'welcome' },
          sentence: null,
          audioBucket: 'b',
          audioKey: 'k1',
          status: 'SCORED',
          tokensSpent: { toString: () => '1' },
          rawScore: null,
          score: null,
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          compositeScore: null,
          payoutTokenAmount: null,
          adminAuditStatus: null,
          adminAuditedAt: null,
          scoredAt: null,
          settledAt: null,
        },
      ]);
      prisma.wordRecording.count.mockResolvedValue(1);

      const result = await service.listForTrainer('trainer-1', { page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.id)).toEqual(['word-new']);
      expect(result.items[0].kind).toBe('word');
      expect(result.items[0].audioUrl).toBe('https://signed.example/audio');
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'trainer-1' } }),
      );
    });

    it('paginates at the DB level', async () => {
      prisma.wordRecording.findMany.mockResolvedValue(
        Array.from({ length: 2 }, (_, i) => ({
          id: `word-${i}`,
          createdAt: new Date(2026, 0, i + 1),
          direction: 'ENGLISH_TO_DIALECT',
          dialectTag: 'ig',
          translationText: 't',
          word: null,
          sentence: null,
          audioBucket: null,
          audioKey: null,
          status: 'SCORED',
          tokensSpent: { toString: () => '1' },
          rawScore: null,
          score: null,
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          compositeScore: null,
          payoutTokenAmount: null,
          adminAuditStatus: null,
          adminAuditedAt: null,
          scoredAt: null,
          settledAt: null,
        })),
      );
      prisma.wordRecording.count.mockResolvedValue(3);

      const page1 = await service.listForTrainer('trainer-1', { page: 1, pageSize: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.totalPages).toBe(2);

      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 2 }),
      );
    });
  });

  describe('listAll', () => {
    it('queries word recordings with DB-level pagination, sort, and where filters', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([]);
      prisma.wordRecording.count.mockResolvedValue(0);

      await service.listAll({
        page: 2,
        pageSize: 10,
        sortBy: 'score',
        sortDir: 'asc',
        dialectTag: 'ig',
        minScore: 50,
      } as never);

      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dialectTag: 'ig', score: { gte: 50 } }),
          orderBy: { score: 'asc' },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('applies the unreviewed filter', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([]);
      prisma.wordRecording.count.mockResolvedValue(0);

      await service.listAll({
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortDir: 'desc',
        reviewState: 'unreviewed',
      } as never);

      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ adminAuditStatus: null }) }),
      );
    });

    it('maps rows to summaries including the trainer info and reports total/totalPages', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'word-1',
          createdAt: new Date('2026-01-01'),
          direction: 'ENGLISH_TO_DIALECT',
          dialectTag: 'ig',
          translationText: 'nnọọ',
          transcript: 'nno',
          word: { text: 'welcome' },
          sentence: null,
          audioBucket: 'b',
          audioKey: 'k',
          status: 'SCORED',
          tokensSpent: { toString: () => '1' },
          rawScore: null,
          score: null,
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          compositeScore: null,
          payoutTokenAmount: null,
          adminAuditStatus: null,
          adminAuditedAt: null,
          scoredAt: null,
          settledAt: null,
          user: { id: 'trainer-1', email: 't@example.com', firstName: 'A', lastName: 'B' },
        },
      ]);
      prisma.wordRecording.count.mockResolvedValue(1);

      const result = await service.listAll({
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortDir: 'desc',
      } as never);

      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.items[0].trainer).toEqual({
        id: 'trainer-1',
        email: 't@example.com',
        firstName: 'A',
        lastName: 'B',
      });
    });

    it('exposes the ASR transcript separately from the typed answer', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'word-1',
          createdAt: new Date('2026-01-01'),
          direction: 'ENGLISH_TO_DIALECT',
          dialectTag: 'ig',
          translationText: 'nnọọ',
          transcript: 'nno',
          word: { text: 'welcome' },
          sentence: null,
          audioBucket: 'b',
          audioKey: 'k',
          status: 'SCORED',
          tokensSpent: { toString: () => '1' },
          rawScore: null,
          score: null,
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          compositeScore: null,
          payoutTokenAmount: null,
          adminAuditStatus: null,
          adminAuditedAt: null,
          scoredAt: null,
          settledAt: null,
        },
      ]);
      prisma.wordRecording.count.mockResolvedValue(1);

      const result = await service.listAll({
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortDir: 'desc',
      } as never);

      expect(result.items[0].responseText).toBe('nnọọ');
      expect(result.items[0].asrTranscript).toBe('nno');
    });

    it('falls back to Sentence text for promptText when the recording has no Word source', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'word-2',
          createdAt: new Date('2026-01-01'),
          direction: 'ENGLISH_TO_DIALECT',
          dialectTag: 'ig',
          translationText: 'ụtụtụ ọma',
          transcript: null,
          word: null,
          sentence: { text: 'good morning' },
          audioBucket: 'b',
          audioKey: 'k',
          status: 'PENDING',
          tokensSpent: { toString: () => '1' },
          rawScore: null,
          score: null,
          noiseScore: null,
          qualityScore: null,
          livenessScore: null,
          compositeScore: null,
          payoutTokenAmount: null,
          adminAuditStatus: null,
          adminAuditedAt: null,
          scoredAt: null,
          settledAt: null,
        },
      ]);
      prisma.wordRecording.count.mockResolvedValue(1);

      const result = await service.listAll({
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortDir: 'desc',
      } as never);

      expect(result.items[0].promptText).toBe('good morning');
    });
  });

  describe('audit', () => {
    it('marks a recording VALID with no wallet effect', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: null,
      });
      prisma.wordRecording.update.mockResolvedValue({
        adminAuditStatus: 'VALID',
        adminAuditedAt: new Date(),
      });

      const result = await service.audit('admin-1', 'word-1', { status: 'VALID' as never });

      expect(result.clawedBack).toBe(false);
      expect(adjustAdminWallet).not.toHaveBeenCalled();
    });

    it('marks INVALID without clawback when clawback is not requested', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: { toNumber: () => 5 },
      });
      prisma.wordRecording.update.mockResolvedValue({
        adminAuditStatus: 'INVALID',
        adminAuditedAt: new Date(),
      });

      const result = await service.audit('admin-1', 'word-1', { status: 'INVALID' as never });

      expect(result.clawedBack).toBe(false);
      expect(adjustAdminWallet).not.toHaveBeenCalled();
    });

    it('claws back the payout when INVALID + clawback and OTP is disabled', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: { toNumber: () => 5 },
      });
      prisma.wordRecording.update.mockResolvedValue({
        adminAuditStatus: 'INVALID',
        adminAuditedAt: new Date(),
      });
      (adjustAdminWallet as jest.Mock).mockResolvedValue({ balance: '10' });

      const result = await service.audit('admin-1', 'word-1', {
        status: 'INVALID' as never,
        clawback: true,
      });

      expect(result.clawedBack).toBe(true);
      expect(adjustAdminWallet).toHaveBeenCalledWith(
        prisma,
        'trainer-1',
        -5,
        'recording-audit:word:word-1',
      );
    });

    it('requires OTP for a clawback when adminPayoutOtpEnabled is on', async () => {
      settings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: { toNumber: () => 5 },
      });

      await expect(
        service.audit('admin-1', 'word-1', {
          status: 'INVALID' as never,
          clawback: true,
        }),
      ).rejects.toThrow('OTP verification is required');
      expect(adjustAdminWallet).not.toHaveBeenCalled();
    });

    it('verifies OTP then claws back when code/otpRequestId are supplied', async () => {
      settings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: { toNumber: () => 5 },
      });
      prisma.wordRecording.update.mockResolvedValue({
        adminAuditStatus: 'INVALID',
        adminAuditedAt: new Date(),
      });
      (adjustAdminWallet as jest.Mock).mockResolvedValue({ balance: '10' });

      const result = await service.audit('admin-1', 'word-1', {
        status: 'INVALID' as never,
        clawback: true,
        otpRequestId: '11111111-1111-1111-1111-111111111111',
        code: '123456',
      });

      expect(otp.verify).toHaveBeenCalled();
      expect(result.clawedBack).toBe(true);
    });

    it('surfaces insufficient balance as a 422, not a raw error', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: { toNumber: () => 5 },
      });
      (adjustAdminWallet as jest.Mock).mockRejectedValue(
        new Error('Insufficient wallet balance for this debit'),
      );

      await expect(
        service.audit('admin-1', 'word-1', {
          status: 'INVALID' as never,
          clawback: true,
        }),
      ).rejects.toThrow('Trainer balance is too low');
    });
  });

  describe('requestAuditClawbackOtp', () => {
    it('rejects when the recording has no payout to claw back', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        id: 'word-1',
        userId: 'trainer-1',
        payoutTokenAmount: null,
      });
      await expect(service.requestAuditClawbackOtp('admin-1', 'word-1')).rejects.toThrow(
        'no payout to claw back',
      );
    });
  });
});
