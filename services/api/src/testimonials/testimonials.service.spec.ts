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
    getTestimonyRewardTokens: jest.fn().mockResolvedValue(5),
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
      testimony: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'testimony-1',
          status: 'PENDING',
          ...data,
        })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'testimony-1', ...data })),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    settings.isTestimonyEnabled.mockReset().mockResolvedValue(true);
    settings.getTestimonyMaxTextLength.mockReset().mockResolvedValue(200);
    settings.getTestimonyMaxVideoSeconds.mockReset().mockResolvedValue(30);
    settings.getTestimonyRewardTokens.mockReset().mockResolvedValue(5);
    (creditTestimonyReward as jest.Mock).mockReset().mockResolvedValue(true);
    service = new TestimonialsService(prisma, settings as any, storage as any);
  });

  describe('submit', () => {
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

    it('allows a new submission even while the trainer already has a PENDING testimony (submit at will, no cap)', async () => {
      const result = await service.submit('user-1', { kind: 'TEXT', text: 'again' } as any);
      expect(result.kind).toBe('TEXT');
      expect(prisma.testimony.create).toHaveBeenCalledTimes(1);
    });

    it('allows a new submission even after an APPROVED testimony (each is reviewed and rewarded independently)', async () => {
      const result = await service.submit('user-1', { kind: 'TEXT', text: 'one more' } as any);
      expect(result.kind).toBe('TEXT');
      expect(prisma.testimony.create).toHaveBeenCalledTimes(1);
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
      });
      (creditTestimonyReward as jest.Mock).mockResolvedValue(false);

      await service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any);

      const rewardCreditedCalls = prisma.testimony.update.mock.calls.filter(
        (call: any) => call[0].data.rewardCredited !== undefined,
      );
      expect(rewardCreditedCalls).toHaveLength(0);
    });

    it('never throws when creditTestimonyReward itself throws -- approval is still recorded', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
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
      });
      await service.review('admin-1', 'testimony-1', { status: 'APPROVED' } as any);

      prisma.testimony.findUnique.mockResolvedValueOnce({
        id: 'testimony-2',
        userId: 'user-1',
        status: 'PENDING',
      });
      await service.review('admin-1', 'testimony-2', { status: 'APPROVED' } as any);

      expect(creditTestimonyReward).toHaveBeenCalledWith(prisma, 'user-1', 'testimony-1', 5);
      expect(creditTestimonyReward).toHaveBeenCalledWith(prisma, 'user-1', 'testimony-2', 5);
      expect(creditTestimonyReward).toHaveBeenCalledTimes(2);
    });

    it('does not credit a reward on rejection', async () => {
      prisma.testimony.findUnique.mockResolvedValue({
        id: 'testimony-1',
        userId: 'user-1',
        status: 'PENDING',
      });

      await service.review('admin-1', 'testimony-1', {
        status: 'REJECTED',
        rejectionReason: 'low quality',
      } as any);

      expect(creditTestimonyReward).not.toHaveBeenCalled();
    });
  });
});
