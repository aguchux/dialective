import { Prisma } from '@dialectiva/db';
import { CommunitySpacesService } from './community-spaces.service';

describe('CommunitySpacesService admin', () => {
  function setup() {
    const prisma = {
      communitySpace: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const service = new CommunitySpacesService(prisma as never);
    return { service, prisma };
  }

  describe('createForAdmin', () => {
    it('rejects a slug that already exists', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createForAdmin({ name: 'General', slug: 'general' } as never),
      ).rejects.toThrow('already exists');
      expect(prisma.communitySpace.create).not.toHaveBeenCalled();
    });

    it('creates a space when the slug is free', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.findUnique.mockResolvedValue(null);
      prisma.communitySpace.create.mockResolvedValue({ id: 'space-1' });

      await service.createForAdmin({ name: 'General', slug: 'general' } as never);
      expect(prisma.communitySpace.create).toHaveBeenCalledWith({
        data: { name: 'General', slug: 'general' },
      });
    });
  });

  describe('deleteForAdmin', () => {
    it('deletes a space with no posts', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.delete.mockResolvedValue({});

      const result = await service.deleteForAdmin('space-1');

      expect(prisma.communitySpace.delete).toHaveBeenCalledWith({ where: { id: 'space-1' } });
      expect(result).toEqual({ id: 'space-1', deleted: true });
    });

    it('404s when the space does not exist', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('missing', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(service.deleteForAdmin('space-1')).rejects.toThrow('Space not found');
    });

    it('tells the admin to archive instead when the space still has posts', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      await expect(service.deleteForAdmin('space-1')).rejects.toThrow('archive it instead');
    });
  });

  describe('reorderForAdmin', () => {
    it('rejects an orderedIds list that omits an existing space', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(service.reorderForAdmin(['a'])).rejects.toThrow(
        'orderedIds must include every existing space exactly once',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an orderedIds list containing an id that does not exist', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(service.reorderForAdmin(['a', 'unknown'])).rejects.toThrow(
        'orderedIds must include every existing space exactly once',
      );
    });

    it('updates each space sortOrder to match its index and returns the fresh list', async () => {
      const { service, prisma } = setup();
      prisma.communitySpace.findMany
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
        .mockResolvedValueOnce([{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }]);
      prisma.communitySpace.update.mockResolvedValue({});

      const result = await service.reorderForAdmin(['b', 'a']);

      expect(prisma.communitySpace.update).toHaveBeenCalledWith({
        where: { id: 'b' },
        data: { sortOrder: 0 },
      });
      expect(prisma.communitySpace.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { sortOrder: 1 },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }]);
    });
  });
});
