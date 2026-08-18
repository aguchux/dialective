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
      submission: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' }) },
    };
    storage = { createPresignedDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://signed.example/audio' }) };
    otp = { issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'req-1' }), verify: jest.fn().mockResolvedValue(undefined) };
    settings = { isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false) };
    service = new AdminRecordingsService(prisma, storage, otp, settings);
  });

  describe('listForTrainer', () => {
    it('merges word recordings and submissions, newest first, then paginates the merged list', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'word-old', createdAt: new Date('2026-01-01'), direction: 'ENGLISH_TO_DIALECT', dialectTag: 'ig',
          translationText: 'nnọọ', word: { text: 'welcome' }, prompt: null, audioBucket: 'b', audioKey: 'k1',
          status: 'SCORED', tokensSpent: { toString: () => '1' }, rawScore: null, score: null, noiseScore: null,
          qualityScore: null, livenessScore: null, compositeScore: null, payoutTokenAmount: null,
          adminAuditStatus: null, adminAuditedAt: null, scoredAt: null, settledAt: null,
        },
      ]);
      prisma.submission.findMany.mockResolvedValue([
        {
          id: 'sub-new', createdAt: new Date('2026-01-02'), dialectTag: 'ig', transcript: 'hello there',
          prompt: { text: 'Say hello' }, audioBucket: 'b', audioKey: 'k2', status: 'SETTLED',
          tokensSpent: { toString: () => '1' }, rawScore: null, score: null, noiseScore: null, qualityScore: null,
          livenessScore: null, compositeScore: null, payoutTokenAmount: null, rejectionReason: null,
          adminAuditStatus: null, adminAuditedAt: null, scoredAt: null, settledAt: null,
        },
      ]);

      const result = await service.listForTrainer('trainer-1', { page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.id)).toEqual(['sub-new', 'word-old']);
      expect(result.items[0].kind).toBe('submission');
      expect(result.items[0].audioUrl).toBe('https://signed.example/audio');
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'trainer-1' } }));
    });

    it('paginates the merged list, not each source query separately', async () => {
      prisma.wordRecording.findMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          id: `word-${i}`, createdAt: new Date(2026, 0, i + 1), direction: 'ENGLISH_TO_DIALECT', dialectTag: 'ig',
          translationText: 't', word: null, prompt: null, audioBucket: null, audioKey: null, status: 'SCORED',
          tokensSpent: { toString: () => '1' }, rawScore: null, score: null, noiseScore: null, qualityScore: null,
          livenessScore: null, compositeScore: null, payoutTokenAmount: null, adminAuditStatus: null,
          adminAuditedAt: null, scoredAt: null, settledAt: null,
        })),
      );

      const page1 = await service.listForTrainer('trainer-1', { page: 1, pageSize: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.totalPages).toBe(2);

      const page2 = await service.listForTrainer('trainer-1', { page: 2, pageSize: 2 });
      expect(page2.items).toHaveLength(1);
    });
  });

  describe('listAll', () => {
    it('queries word recordings with DB-level pagination, sort, and where filters', async () => {
      prisma.wordRecording.findMany.mockResolvedValue([]);
      prisma.wordRecording.count.mockResolvedValue(0);

      await service.listAll({
        kind: 'word',
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
      expect(prisma.submission.findMany).not.toHaveBeenCalled();
    });

    it('queries submissions when kind is submission and applies the unreviewed filter', async () => {
      prisma.submission.findMany.mockResolvedValue([]);
      prisma.submission.count.mockResolvedValue(0);

      await service.listAll({ kind: 'submission', page: 1, pageSize: 20, sortBy: 'createdAt', sortDir: 'desc', reviewState: 'unreviewed' } as never);

      expect(prisma.submission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ adminAuditStatus: null }) }),
      );
    });

    it('maps rows to summaries including the trainer info and reports total/totalPages', async () => {
      prisma.submission.findMany.mockResolvedValue([
        {
          id: 'sub-1', createdAt: new Date('2026-01-01'), dialectTag: 'ig', transcript: 'hi',
          prompt: { text: 'Say hi' }, audioBucket: 'b', audioKey: 'k', status: 'SETTLED',
          tokensSpent: { toString: () => '1' }, rawScore: null, score: null, noiseScore: null, qualityScore: null,
          livenessScore: null, compositeScore: null, payoutTokenAmount: null, rejectionReason: null,
          adminAuditStatus: null, adminAuditedAt: null, scoredAt: null, settledAt: null,
          user: { id: 'trainer-1', email: 't@example.com', firstName: 'A', lastName: 'B' },
        },
      ]);
      prisma.submission.count.mockResolvedValue(1);

      const result = await service.listAll({ kind: 'submission', page: 1, pageSize: 20, sortBy: 'createdAt', sortDir: 'desc' } as never);

      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.items[0].trainer).toEqual({ id: 'trainer-1', email: 't@example.com', firstName: 'A', lastName: 'B' });
    });
  });

  describe('audit', () => {
    it('marks a recording VALID with no wallet effect', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({ id: 'word-1', userId: 'trainer-1', payoutTokenAmount: null });
      prisma.wordRecording.update.mockResolvedValue({ adminAuditStatus: 'VALID', adminAuditedAt: new Date() });

      const result = await service.audit('admin-1', 'word', 'word-1', { status: 'VALID' as never });

      expect(result.clawedBack).toBe(false);
      expect(adjustAdminWallet).not.toHaveBeenCalled();
    });

    it('marks INVALID without clawback when clawback is not requested', async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'trainer-1', payoutTokenAmount: { toNumber: () => 5 } });
      prisma.submission.update.mockResolvedValue({ adminAuditStatus: 'INVALID', adminAuditedAt: new Date() });

      const result = await service.audit('admin-1', 'submission', 'sub-1', { status: 'INVALID' as never });

      expect(result.clawedBack).toBe(false);
      expect(adjustAdminWallet).not.toHaveBeenCalled();
    });

    it('claws back the payout when INVALID + clawback and OTP is disabled', async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'trainer-1', payoutTokenAmount: { toNumber: () => 5 } });
      prisma.submission.update.mockResolvedValue({ adminAuditStatus: 'INVALID', adminAuditedAt: new Date() });
      (adjustAdminWallet as jest.Mock).mockResolvedValue({ balance: '10' });

      const result = await service.audit('admin-1', 'submission', 'sub-1', { status: 'INVALID' as never, clawback: true });

      expect(result.clawedBack).toBe(true);
      expect(adjustAdminWallet).toHaveBeenCalledWith(prisma, 'trainer-1', -5, 'recording-audit:submission:sub-1');
    });

    it('requires OTP for a clawback when adminPayoutOtpEnabled is on', async () => {
      settings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'trainer-1', payoutTokenAmount: { toNumber: () => 5 } });

      await expect(
        service.audit('admin-1', 'submission', 'sub-1', { status: 'INVALID' as never, clawback: true }),
      ).rejects.toThrow('OTP verification is required');
      expect(adjustAdminWallet).not.toHaveBeenCalled();
    });

    it('verifies OTP then claws back when code/otpRequestId are supplied', async () => {
      settings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'trainer-1', payoutTokenAmount: { toNumber: () => 5 } });
      prisma.submission.update.mockResolvedValue({ adminAuditStatus: 'INVALID', adminAuditedAt: new Date() });
      (adjustAdminWallet as jest.Mock).mockResolvedValue({ balance: '10' });

      const result = await service.audit('admin-1', 'submission', 'sub-1', {
        status: 'INVALID' as never,
        clawback: true,
        otpRequestId: '11111111-1111-1111-1111-111111111111',
        code: '123456',
      });

      expect(otp.verify).toHaveBeenCalled();
      expect(result.clawedBack).toBe(true);
    });

    it('surfaces insufficient balance as a 422, not a raw error', async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'trainer-1', payoutTokenAmount: { toNumber: () => 5 } });
      (adjustAdminWallet as jest.Mock).mockRejectedValue(new Error('Insufficient wallet balance for this debit'));

      await expect(
        service.audit('admin-1', 'submission', 'sub-1', { status: 'INVALID' as never, clawback: true }),
      ).rejects.toThrow('Trainer balance is too low');
    });
  });

  describe('requestAuditClawbackOtp', () => {
    it('rejects when the recording has no payout to claw back', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({ id: 'word-1', userId: 'trainer-1', payoutTokenAmount: null });
      await expect(service.requestAuditClawbackOtp('admin-1', 'word', 'word-1')).rejects.toThrow('no payout to claw back');
    });
  });
});
