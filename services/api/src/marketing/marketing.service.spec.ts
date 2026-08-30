jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
}));
import { Prisma } from '@dialectiva/db';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketingService } from './marketing.service';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('MarketingService', () => {
  const storage = {
    createPresignedUploadUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://upload', key: 'ads/k.jpg', expiresInSeconds: 900 }),
    getPublicObjectUrl: jest.fn().mockReturnValue('https://public/ad.jpg'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  let prisma: any;
  let service: MarketingService;

  beforeEach(() => {
    prisma = {
      marketingAdPhoto: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'photo-1', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'photo-1', ...data })),
        delete: jest.fn(),
      },
      marketingHeadline: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'headline-1', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'headline-1', ...data })),
        delete: jest.fn(),
      },
      marketingCampaignShare: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'share-1',
          viewCount: 0,
          ...data,
        })),
        update: jest.fn(),
      },
      marketingCampaignRegistration: {
        create: jest.fn().mockResolvedValue({ id: 'reg-1' }),
      },
    };
    service = new MarketingService(prisma, storage as any);
    jest.clearAllMocks();
  });

  describe('listPhotosAdmin', () => {
    it('attaches a public url to each photo', async () => {
      prisma.marketingAdPhoto.findMany.mockResolvedValue([
        { id: 'p1', format: 'STORY', bucket: 'b', key: 'ads/k.jpg', active: true, sortOrder: 0 },
      ]);

      const result = await service.listPhotosAdmin();

      expect(result).toEqual([expect.objectContaining({ id: 'p1', url: 'https://public/ad.jpg' })]);
    });
  });

  describe('listMaterials', () => {
    it('queries only active rows, optionally scoped to a format', async () => {
      await service.listMaterials('STORY');
      expect(prisma.marketingAdPhoto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true, format: 'STORY' } }),
      );
      expect(prisma.marketingHeadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true, format: 'STORY' } }),
      );
    });
  });

  describe('getOrCreateShare', () => {
    it('rejects pairing a photo and headline of different formats', async () => {
      prisma.marketingAdPhoto.findUnique.mockResolvedValue({ id: 'p1', format: 'STORY' });
      prisma.marketingHeadline.findUnique.mockResolvedValue({ id: 'h1', format: 'FEED_SQUARE' });

      await expect(
        service.getOrCreateShare('user-1', { photoId: 'p1', headlineId: 'h1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.marketingCampaignShare.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the photo does not exist', async () => {
      prisma.marketingAdPhoto.findUnique.mockResolvedValue(null);
      prisma.marketingHeadline.findUnique.mockResolvedValue({ id: 'h1', format: 'STORY' });

      await expect(
        service.getOrCreateShare('user-1', { photoId: 'missing', headlineId: 'h1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a new share on first pairing', async () => {
      prisma.marketingAdPhoto.findUnique.mockResolvedValue({ id: 'p1', format: 'STORY' });
      prisma.marketingHeadline.findUnique.mockResolvedValue({ id: 'h1', format: 'STORY' });

      const result = await service.getOrCreateShare('user-1', { photoId: 'p1', headlineId: 'h1' });

      expect(prisma.marketingCampaignShare.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', photoId: 'p1', headlineId: 'h1' },
      });
      expect(result.id).toBe('share-1');
    });

    it('reuses an existing share for the same (userId, photoId, headlineId) instead of creating a duplicate', async () => {
      prisma.marketingAdPhoto.findUnique.mockResolvedValue({ id: 'p1', format: 'STORY' });
      prisma.marketingHeadline.findUnique.mockResolvedValue({ id: 'h1', format: 'STORY' });
      prisma.marketingCampaignShare.findUnique.mockResolvedValue({
        id: 'existing-share',
        userId: 'user-1',
        photoId: 'p1',
        headlineId: 'h1',
        viewCount: 3,
      });

      const result = await service.getOrCreateShare('user-1', { photoId: 'p1', headlineId: 'h1' });

      expect(result.id).toBe('existing-share');
      expect(prisma.marketingCampaignShare.create).not.toHaveBeenCalled();
    });
  });

  describe('getShareForInvite', () => {
    it('throws NotFoundException for a missing share id', async () => {
      prisma.marketingCampaignShare.findUnique.mockResolvedValue(null);
      await expect(service.getShareForInvite('missing')).rejects.toThrow(NotFoundException);
    });

    it('increments the view count as a side effect and returns headline/photo details', async () => {
      prisma.marketingCampaignShare.findUnique.mockResolvedValue({
        id: 'share-1',
        photo: { bucket: 'b', key: 'ads/k.jpg' },
        headline: { title: 'Title', description: 'Desc' },
      });

      const result = await service.getShareForInvite('share-1');

      expect(prisma.marketingCampaignShare.update).toHaveBeenCalledWith({
        where: { id: 'share-1' },
        data: { viewCount: { increment: 1 } },
      });
      expect(result).toEqual({
        title: 'Title',
        description: 'Desc',
        photoUrl: 'https://public/ad.jpg',
      });
    });

    it('still returns the headline details even when the view-count update fails', async () => {
      prisma.marketingCampaignShare.findUnique.mockResolvedValue({
        id: 'share-1',
        photo: { bucket: 'b', key: 'ads/k.jpg' },
        headline: { title: 'Title', description: 'Desc' },
      });
      prisma.marketingCampaignShare.update.mockRejectedValue(new Error('db down'));

      await expect(service.getShareForInvite('share-1')).resolves.toMatchObject({
        title: 'Title',
      });
    });
  });

  describe('recordRegistration', () => {
    it('creates a registration row', async () => {
      await service.recordRegistration('share-1', 'user-2');
      expect(prisma.marketingCampaignRegistration.create).toHaveBeenCalledWith({
        data: { shareId: 'share-1', invitedUserId: 'user-2' },
      });
    });

    it('is a no-op (does not throw) on a duplicate invitedUserId', async () => {
      prisma.marketingCampaignRegistration.create.mockRejectedValue(p2002());
      await expect(service.recordRegistration('share-1', 'user-2')).resolves.toBeUndefined();
    });

    it('never throws even on an unexpected error (e.g. an invalid shareId FK)', async () => {
      prisma.marketingCampaignRegistration.create.mockRejectedValue(new Error('FK violation'));
      await expect(service.recordRegistration('bad-share', 'user-2')).resolves.toBeUndefined();
    });
  });

  describe('deletePhoto', () => {
    it('deletes the DB row and best-effort deletes the storage object', async () => {
      prisma.marketingAdPhoto.findUnique.mockResolvedValue({
        id: 'photo-1',
        bucket: 'b',
        key: 'ads/k.jpg',
      });

      await service.deletePhoto('photo-1');

      expect(prisma.marketingAdPhoto.delete).toHaveBeenCalledWith({ where: { id: 'photo-1' } });
      expect(storage.deleteObject).toHaveBeenCalledWith('b', 'ads/k.jpg');
    });

    it('does not throw when the storage delete fails', async () => {
      prisma.marketingAdPhoto.findUnique.mockResolvedValue({
        id: 'photo-1',
        bucket: 'b',
        key: 'ads/k.jpg',
      });
      storage.deleteObject.mockRejectedValueOnce(new Error('spaces down'));

      await expect(service.deletePhoto('photo-1')).resolves.toBeDefined();
    });
  });
});
