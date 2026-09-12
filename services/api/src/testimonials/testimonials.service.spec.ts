jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditTestimonyReward: jest.fn(),
}));
import { creditTestimonyReward } from '@dialectiva/db';
import { TestimonialsService } from './testimonials.service';

describe('TestimonialsService', () => {
  const settings = {
    isTestimonyEnabled: jest.fn().mockResolvedValue(true),
    getTestimonyMaxTextLength: jest.fn().mockResolvedValue(200),
    getTestimonyMaxVideoSeconds: jest.fn().mockResolvedValue(30),
    getTestimonyTextRewardTokens: jest.fn().mockResolvedValue(5),
    getTestimonyVideoRewardTokens: jest.fn().mockResolvedValue(10),
    getTestimonyApprovalWeeklyLimit: jest.fn().mockResolvedValue(1),
    getTestimonyApprovalMonthlyLimit: jest.fn().mockResolvedValue(3),
  };
  const storage = {
    createPresignedUploadUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://upload', key: 'k', expiresInSeconds: 900 }),
    getPublicObjectUrl: jest.fn().mockReturnValue('https://public/video.webm'),
  };
  let prisma: any;
  let service: TestimonialsService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'TRAINER', kycStatus: 'APPROVED' }),
      },
      testimony: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'testimony-1',
          status: 'PENDING',
          ...data,
        })),
        update: jest.fn().mockImplementation(({ where, data }: any) => ({
          id: where.id,
          ...data,
        })),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    settings.isTestimonyEnabled.mockReset().mockResolvedValue(true);
    settings.getTestimonyMaxTextLength.mockReset().mockResolvedValue(200);
    settings.getTestimonyMaxVideoSeconds.mockReset().mockResolvedValue(30);
    settings.getTestimonyTextRewardTokens.mockReset().mockResolvedValue(5);
    settings.getTestimonyVideoRewardTokens.mockReset().mockResolvedValue(10);
    settings.getTestimonyApprovalWeeklyLimit.mockReset().mockResolvedValue(1);
    settings.getTestimonyApprovalMonthlyLimit.mockReset().mockResolvedValue(3);
    storage.createPresignedUploadUrl.mockClear();
    storage.getPublicObjectUrl.mockClear();
    (creditTestimonyReward as jest.Mock).mockReset().mockResolvedValue(true);
    service = new TestimonialsService(prisma, settings as any, storage as any);
  });

  describe('submit', () => {
    it('rejects testimonial submission until DIDIT verification is approved', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'TRAINER', kycStatus: 'IN_REVIEW' });

      await expect(
        service.submit('user-1', { kind: 'TEXT', text: 'great platform' } as any),
      ).rejects.toThrow('DIDIT identity verification');
      expect(prisma.testimony.create).not.toHaveBeenCalled();
    });

    it('rejects a verified account that is not a trainer', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'DISTRIBUTOR', kycStatus: 'APPROVED' });

      await expect(
        service.submit('user-1', { kind: 'TEXT', text: 'great platform' } as any),
      ).rejects.toThrow('DIDIT identity verification');
      expect(prisma.testimony.create).not.toHaveBeenCalled();
    });

    it('rejects when testimonyEnabled is false', async () => {
      settings.isTestimonyEnabled.mockResolvedValue(false);
      await expect(
        service.submit('user-1', { kind: 'TEXT', text: 'great' } as any),
      ).rejects.toThrow('Testimonials are not currently open');
      expect(prisma.testimony.create).not.toHaveBeenCalled();
    });

    it('rejects a TEXT testimony over the configured max length', async () => {
      settings.getTestimonyMaxTextLength.mockResolvedValue(10);
      await expect(
        service.submit('user-1', { kind: 'TEXT', text: 'this is way too long' } as any),
      ).rejects.toThrow('10 characters or fewer');
      expect(prisma.testimony.create).not.toHaveBeenCalled();
    });

    it('accepts a TEXT testimony within the configured max length', async () => {
      const result = await service.submit('user-1', {
        kind: 'TEXT',
        text: 'great platform',
      } as any);
      expect(result.kind).toBe('TEXT');
      expect(prisma.testimony.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ text: 'great platform' }) }),
      );
    });

    it('rejects a VIDEO testimony whose durationMs exceeds the configured seconds cap', async () => {
      settings.getTestimonyMaxVideoSeconds.mockResolvedValue(30);
      await expect(
        service.submit('user-1', {
          kind: 'VIDEO',
          bucket: 'b',
          videoKey: 'k',
          durationMs: 31_000,
        } as any),
      ).rejects.toThrow('30 seconds or shorter');
      expect(prisma.testimony.create).not.toHaveBeenCalled();
    });

    it('accepts a VIDEO testimony within the configured seconds cap', async () => {
      const result = await service.submit('user-1', {
        kind: 'VIDEO',
        bucket: 'b',
        videoKey: 'k',
        durationMs: 29_000,
      } as any);
      expect(result.kind).toBe('VIDEO');
    });

    it("allows a new submission while under the monthly cap, regardless of the other testimony's status", async () => {
      prisma.testimony.count.mockResolvedValue(1);
      const result = await service.submit('user-1', { kind: 'TEXT', text: 'again' } as any);
      expect(result.kind).toBe('TEXT');
      expect(prisma.testimony.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a third submission within the rolling 30-day window', async () => {
      prisma.testimony.count.mockResolvedValue(2);

      await expect(
        service.submit('user-1', { kind: 'TEXT', text: 'one more' } as any),
      ).rejects.toThrow('up to 2 testimonials per month');
      expect(prisma.testimony.create).not.toHaveBeenCalled();
    });

    it('counts pending/approved/rejected submissions alike toward the monthly cap', async () => {
      prisma.testimony.count.mockResolvedValue(2);

      await expect(
        service.submit('user-1', { kind: 'TEXT', text: 'retry' } as any),
      ).rejects.toThrow('up to 2 testimonials per month');
      expect(prisma.testimony.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', createdAt: { gte: expect.any(Date) } },
      });
    });

    it('allows a new submission once older submissions have rolled outside the 30-day window', async () => {
      prisma.testimony.count.mockResolvedValue(0);
      const result = await service.submit('user-1', { kind: 'TEXT', text: 'fresh month' } as any);
      expect(result.kind).toBe('TEXT');
    });
  });

  describe('createUploadUrl', () => {
    it('does not issue a public video upload URL before DIDIT verification is approved', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'TRAINER', kycStatus: 'NOT_STARTED' });

      await expect(
        service.createUploadUrl('user-1', { contentType: 'video/webm' } as any),
      ).rejects.toThrow('DIDIT identity verification');
      expect(storage.createPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('listMine', () => {
    it('returns every testimony for the trainer, newest first', async () => {
      prisma.testimony.findMany.mockResolvedValue([
        { id: 't2', status: 'PENDING' },
        { id: 't1', status: 'APPROVED' },
      ]);

      const result = await service.listMine('user-1');

      expect(prisma.testimony.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('review', () => {
    it('credits the reward exactly once and sets rewardCredited on approval', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'TEXT',
      });

      await service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any);

      expect(creditTestimonyReward).toHaveBeenCalledWith(prisma, 'user-1', 'testimony-1', 5);
      expect(prisma.testimony.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rewardCredited: true }) }),
      );
    });

    it('does not set rewardCredited when creditTestimonyReward reports a no-op (already credited)', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'VIDEO',
      });
      (creditTestimonyReward as jest.Mock).mockResolvedValue(false);

      await service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any);

      const rewardCreditedCalls = prisma.testimony.update.mock.calls.filter(
        (call: any) => call[0].data.rewardCredited !== undefined,
      );
      expect(rewardCreditedCalls).toHaveLength(0);
      expect(creditTestimonyReward).toHaveBeenCalledWith(prisma, 'user-1', 'testimony-1', 10);
    });

    it('never throws when creditTestimonyReward itself throws -- approval is still recorded', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'TEXT',
      });
      (creditTestimonyReward as jest.Mock).mockRejectedValue(new Error('ledger down'));

      await expect(
        service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any),
      ).resolves.toMatchObject({ status: 'APPROVED' });
    });

    it('rejects reviewing a testimony that is not PENDING (no double review)', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'APPROVED',
        kind: 'TEXT',
      });

      await expect(
        service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any),
      ).rejects.toThrow('already been reviewed');
      expect(creditTestimonyReward).not.toHaveBeenCalled();
    });

    it('credits a second, independent reward when a different testimony from the same trainer is approved', async () => {
      prisma.testimony.findUnique.mockResolvedValueOnce({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'TEXT',
      });
      await service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any);

      prisma.testimony.findUnique.mockResolvedValueOnce({
        id: 'testimony-2',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'VIDEO',
      });
      await service.review('admin-1', 'testimony-2', { status: 'APPROVED' } as any);

      expect(creditTestimonyReward).toHaveBeenCalledWith(prisma, 'user-1', 'testimony-1', 5);
      expect(creditTestimonyReward).toHaveBeenCalledWith(prisma, 'user-1', 'testimony-2', 10);
      expect(creditTestimonyReward).toHaveBeenCalledTimes(2);
    });

    it('does not credit a reward on rejection', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'TEXT',
      });

      await service.review('admin-1', 'testimony-1', {
        status: 'REJECTED',
        rejectionReason: 'low quality',
      } as any);

      expect(creditTestimonyReward).not.toHaveBeenCalled();
    });

    it('blocks approval when the trainer reached the weekly approval limit', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        kind: 'TEXT',
      });
      prisma.testimony.count.mockResolvedValue(1);

      await expect(
        service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any),
      ).rejects.toThrow('weekly testimony approval limit of 1');
      expect(prisma.testimony.update).not.toHaveBeenCalled();
      expect(creditTestimonyReward).not.toHaveBeenCalled();
    });
  });

  describe('updatePendingText', () => {
    it('records a pending text correction and the editing admin', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        kind: 'TEXT',
        status: 'PENDING',
      });

      await service.updatePendingText('admin-1', 'testimony-1', { text: '  Clear wording.  ' });

      expect(prisma.testimony.update).toHaveBeenCalledWith({
        where: { id: 'testimony-1' },
        data: {
          text: 'Clear wording.',
          adminEditedAt: expect.any(Date),
          editedByAdminId: 'admin-1',
        },
      });
    });

    it('does not allow a video or reviewed testimonial to be edited', async () => {
      prisma.testimony.findUnique.mockResolvedValueOnce({
        id: 'testimony-1',
        kind: 'VIDEO',
        status: 'PENDING',
      });
      await expect(
        service.updatePendingText('admin-1', 'testimony-1', { text: 'Correction' }),
      ).rejects.toThrow('Only text testimonials can be edited');

      prisma.testimony.findUnique.mockResolvedValueOnce({
        id: 'testimony-2',
        kind: 'TEXT',
        status: 'APPROVED',
      });
      await expect(
        service.updatePendingText('admin-1', 'testimony-2', { text: 'Correction' }),
      ).rejects.toThrow('Only pending testimonials can be edited');
    });
  });

  describe('setVisibility', () => {
    it('hides an approved testimony without touching status or reward', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'APPROVED',
        rewardCredited: true,
        visible: true,
      });

      const result = await service.setVisibility('testimony-1', { visible: false });

      expect(prisma.testimony.update).toHaveBeenCalledWith({
        where: { id: 'testimony-1' },
        data: { visible: false },
      });
      expect(result.visible).toBe(false);
    });

    it('re-shows a previously hidden approved testimony', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'APPROVED',
        visible: false,
      });

      await service.setVisibility('testimony-1', { visible: true });

      expect(prisma.testimony.update).toHaveBeenCalledWith({
        where: { id: 'testimony-1' },
        data: { visible: true },
      });
    });

    it('rejects toggling visibility on a testimony that is not APPROVED', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
        visible: true,
      });

      await expect(service.setVisibility('testimony-1', { visible: false })).rejects.toThrow(
        'Only an approved testimony can be shown or hidden publicly',
      );
      expect(prisma.testimony.update).not.toHaveBeenCalled();
    });

    it('throws when the testimony does not exist', async () => {
      prisma.testimony.findUnique.mockResolvedValue(null);

      await expect(service.setVisibility('missing', { visible: false })).rejects.toThrow(
        'Testimony not found',
      );
    });
  });

  describe('getPublic', () => {
    it('only queries APPROVED and visible testimonies with pagination', async () => {
      prisma.testimony.findMany.mockResolvedValue([]);
      prisma.testimony.count.mockResolvedValue(24);

      const result = await service.getPublic({ page: 2, pageSize: 12 });

      expect(prisma.testimony.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'APPROVED', visible: true },
          skip: 12,
          take: 12,
        }),
      );
      expect(result).toMatchObject({ page: 2, pageSize: 12, total: 24, totalPages: 2 });
    });

    it('hides public testimonials while the feature is disabled', async () => {
      settings.isTestimonyEnabled.mockResolvedValue(false);

      await expect(service.getPublic({ page: 1, pageSize: 12 })).resolves.toEqual({
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 1,
      });
      expect(prisma.testimony.findMany).not.toHaveBeenCalled();
    });
  });
});
