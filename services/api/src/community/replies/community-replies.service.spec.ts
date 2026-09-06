jest.mock('../community-content.util', () => ({
  renderCommunityBody: (markdown: string) => markdown,
}));

import { CommunityRepliesService } from './community-replies.service';

function fakeAuthor() {
  return {
    id: 'author-1',
    firstName: 'Ada',
    lastName: 'Obi',
    role: 'TRAINER',
    kycStatus: 'APPROVED',
    communityProfile: { displayName: 'Ada O.' },
  };
}

describe('CommunityRepliesService', () => {
  let prisma: any;
  let profiles: any;
  let notifications: any;
  let storage: any;
  let settings: any;
  let service: CommunityRepliesService;

  beforeEach(() => {
    prisma = {
      communityReply: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      communityPost: { findUnique: jest.fn() },
      communityProfile: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    profiles = { ensureProfile: jest.fn() };
    notifications = { notify: jest.fn() };
    storage = { getPublicObjectUrl: jest.fn().mockReturnValue('https://public/attachment') };
    settings = { isRepliesEnabled: jest.fn().mockResolvedValue(true) };
    service = new CommunityRepliesService(prisma, profiles, notifications, storage, settings);
  });

  describe('list', () => {
    it('defaults to oldest-first ordering', async () => {
      await service.list('post-1');
      expect(prisma.communityReply.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'asc' }] }),
      );
    });

    it('orders by likeCount desc for "top"', async () => {
      await service.list('post-1', 'top');
      expect(prisma.communityReply.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ likeCount: 'desc' }, { createdAt: 'asc' }] }),
      );
    });

    it('orders by createdAt desc for "newest"', async () => {
      await service.list('post-1', 'newest');
      expect(prisma.communityReply.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }] }),
      );
    });

    it('maps the joined author into a summary and computes likedByMe', async () => {
      prisma.communityReply.findMany.mockResolvedValue([
        { id: 'reply-1', author: fakeAuthor(), reactions: [{ id: 'r1' }] },
      ]);
      const [reply] = await service.list('post-1', undefined, 'viewer-1');
      expect(reply.author).toEqual({ id: 'author-1', displayName: 'Ada O.', badge: 'VERIFIED_TRAINER' });
      expect(reply.likedByMe).toBe(true);
    });
  });

  describe('create', () => {
    it('rejects a reply nested more than one level deep', async () => {
      prisma.communityPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'PUBLISHED', isLocked: false });
      prisma.communityReply.findUnique.mockResolvedValue({ id: 'reply-1', parentReplyId: 'reply-0' });

      await expect(
        service.create('user-1', 'post-1', { body: 'hi', parentReplyId: 'reply-1' } as any),
      ).rejects.toThrow('nested one level deep');
    });

    it('rejects a reply on a locked post', async () => {
      prisma.communityPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'PUBLISHED', isLocked: true });

      await expect(service.create('user-1', 'post-1', { body: 'hi' } as any)).rejects.toThrow('locked');
    });

    it('refuses to create a reply when replies are disabled', async () => {
      settings.isRepliesEnabled.mockResolvedValueOnce(false);

      await expect(service.create('user-1', 'post-1', { body: 'hi' } as any)).rejects.toThrow(
        'Replies are currently disabled',
      );
      expect(prisma.communityPost.findUnique).not.toHaveBeenCalled();
    });
  });
});
