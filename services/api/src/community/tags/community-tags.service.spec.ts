import { CommunityTagsService } from './community-tags.service';

describe('CommunityTagsService admin', () => {
  function setup() {
    const prisma: any = {
      communityTag: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      communityPostTag: {
        count: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    const service = new CommunityTagsService(prisma as never);
    return { service, prisma };
  }

  describe('list vs listForAdmin', () => {
    it('list() only queries non-hidden tags', async () => {
      const { service, prisma } = setup();
      prisma.communityTag.findMany.mockResolvedValue([]);

      await service.list();

      expect(prisma.communityTag.findMany).toHaveBeenCalledWith({
        where: { isHidden: false },
        orderBy: { name: 'asc' },
      });
    });

    it('listForAdmin() returns every tag, including hidden ones', async () => {
      const { service, prisma } = setup();
      const hidden = { id: 'tag-1', name: 'QRAC Integrity Check', isHidden: true };
      prisma.communityTag.findMany.mockResolvedValue([hidden]);

      const result = await service.listForAdmin();

      expect(prisma.communityTag.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
      expect(result).toContainEqual(hidden);
    });
  });

  describe('setHiddenForAdmin', () => {
    it('hides a tag', async () => {
      const { service, prisma } = setup();
      prisma.communityTag.findUnique.mockResolvedValue({ id: 'tag-1' });
      prisma.communityTag.update.mockResolvedValue({ id: 'tag-1', isHidden: true });

      await service.setHiddenForAdmin('tag-1', true);

      expect(prisma.communityTag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { isHidden: true },
      });
    });

    it('unhides a previously hidden tag', async () => {
      const { service, prisma } = setup();
      prisma.communityTag.findUnique.mockResolvedValue({ id: 'tag-1', isHidden: true });
      prisma.communityTag.update.mockResolvedValue({ id: 'tag-1', isHidden: false });

      const result = await service.setHiddenForAdmin('tag-1', false);

      expect(prisma.communityTag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { isHidden: false },
      });
      expect(result.isHidden).toBe(false);
    });

    it('404s when the tag does not exist', async () => {
      const { service, prisma } = setup();
      prisma.communityTag.findUnique.mockResolvedValue(null);

      await expect(service.setHiddenForAdmin('missing', true)).rejects.toThrow('Tag not found');
    });
  });
});
