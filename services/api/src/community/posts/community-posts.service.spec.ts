// sanitize-html's transitive dependency (htmlparser2) ships ESM that Jest's
// default ts-jest transform can't parse -- mock the util module rather than
// pull that transform chain into every community spec.
jest.mock('../community-content.util', () => ({
  renderCommunityBody: (markdown: string) => markdown,
}));

import { CommunityPostsService } from './community-posts.service';

function fakeAuthor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'author-1',
    firstName: 'Ada',
    lastName: 'Obi',
    role: 'TRAINER',
    kycStatus: 'APPROVED',
    communityProfile: { displayName: 'Ada O.' },
    ...overrides,
  };
}

describe('CommunityPostsService', () => {
  let prisma: any;
  let profiles: any;
  let tags: any;
  let storage: any;
  let settings: any;
  let service: CommunityPostsService;

  beforeEach(() => {
    prisma = {
      communitySpace: { findUnique: jest.fn().mockResolvedValue({ id: 'space-1', isArchived: false }) },
      communityPost: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      communityProfile: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ spaceMemberships: [] }),
      },
    };
    profiles = {
      ensureProfile: jest.fn().mockResolvedValue({ id: 'profile-1', createdAt: new Date('2020-01-01') }),
    };
    tags = { resolveOrCreateMany: jest.fn().mockResolvedValue([]) };
    storage = { getPublicObjectUrl: jest.fn().mockReturnValue('https://public/attachment') };
    settings = {
      isPostingEnabled: jest.fn().mockResolvedValue(true),
      isApprovalRequiredForNewMembers: jest.fn().mockResolvedValue(false),
      getNewMemberPostingDelayMinutes: jest.fn().mockResolvedValue(0),
    };
    service = new CommunityPostsService(prisma, profiles, tags, storage, settings);
  });

  describe('create gates', () => {
    it('refuses to create a post when posting is disabled', async () => {
      settings.isPostingEnabled.mockResolvedValueOnce(false);

      await expect(
        service.create('author-1', { title: 'x', spaceId: 'space-1', body: 'hi' } as any),
      ).rejects.toThrow('Posting is currently disabled');
      expect(prisma.communityPost.create).not.toHaveBeenCalled();
    });

    it('refuses when new members require approval', async () => {
      settings.isApprovalRequiredForNewMembers.mockResolvedValueOnce(true);

      await expect(
        service.create('author-1', { title: 'x', spaceId: 'space-1', body: 'hi' } as any),
      ).rejects.toThrow('require moderator approval');
      expect(prisma.communityPost.create).not.toHaveBeenCalled();
    });

    it('refuses a brand-new member before the posting delay elapses', async () => {
      profiles.ensureProfile.mockResolvedValueOnce({ id: 'profile-1', createdAt: new Date() });
      settings.getNewMemberPostingDelayMinutes.mockResolvedValueOnce(60);

      await expect(
        service.create('author-1', { title: 'x', spaceId: 'space-1', body: 'hi' } as any),
      ).rejects.toThrow('New members can post 60 minutes after joining');
      expect(prisma.communityPost.create).not.toHaveBeenCalled();
    });

    it('allows a member whose posting delay has already elapsed', async () => {
      profiles.ensureProfile.mockResolvedValueOnce({
        id: 'profile-1',
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
      });
      settings.getNewMemberPostingDelayMinutes.mockResolvedValueOnce(60);
      prisma.communityPost.create.mockResolvedValue({
        id: 'post-1',
        author: fakeAuthor(),
        space: { id: 'space-1', name: 'General', slug: 'general' },
        tags: [],
        attachments: [],
      });

      await service.create('author-1', { title: 'x', spaceId: 'space-1', body: 'hi' } as any);
      expect(prisma.communityPost.create).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('maps the joined author into a {id, displayName, badge} summary', async () => {
      prisma.communityPost.create.mockResolvedValue({
        id: 'post-1',
        author: fakeAuthor(),
        space: { id: 'space-1', name: 'General', slug: 'general' },
        tags: [],
        attachments: [],
        reactions: [],
        bookmarks: [],
      });

      const result = await service.create('author-1', {
        title: 'Hello world',
        spaceId: 'space-1',
        body: 'hi',
      } as any);

      expect(result.author).toEqual({ id: 'author-1', displayName: 'Ada O.', badge: 'VERIFIED_TRAINER' });
      expect(result.likedByMe).toBe(false);
      expect(result.bookmarkedByMe).toBe(false);
    });

    it('creates a DRAFT post when status is provided, PUBLISHED otherwise', async () => {
      prisma.communityPost.create.mockResolvedValue({
        id: 'post-1',
        author: fakeAuthor(),
        space: { id: 'space-1', name: 'General', slug: 'general' },
        tags: [],
        attachments: [],
      });

      await service.create('author-1', { title: 'Draft me', spaceId: 'space-1', body: 'hi', status: 'DRAFT' } as any);
      expect(prisma.communityPost.create.mock.calls[0][0].data.status).toBe('DRAFT');

      await service.create('author-1', { title: 'Publish me', spaceId: 'space-1', body: 'hi' } as any);
      expect(prisma.communityPost.create.mock.calls[1][0].data.status).toBe('PUBLISHED');
    });
  });

  describe('getById', () => {
    it('looks up by either id or slug', async () => {
      prisma.communityPost.findFirst.mockResolvedValue({
        id: 'post-1',
        slug: 'hello-world-abc123',
        status: 'PUBLISHED',
        author: fakeAuthor(),
        space: { id: 'space-1', name: 'General', slug: 'general' },
        tags: [],
        attachments: [],
        reactions: [{ id: 'r1' }],
        bookmarks: [],
      });
      prisma.communityPost.update.mockResolvedValue({});

      const result = await service.getById('hello-world-abc123', 'viewer-1');

      expect(prisma.communityPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ id: 'hello-world-abc123' }, { slug: 'hello-world-abc123' }] },
        }),
      );
      expect(result.likedByMe).toBe(true);
      expect(result.bookmarkedByMe).toBe(false);
    });

    it('throws NotFoundException for a deleted or hidden post', async () => {
      prisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1', status: 'DELETED' });
      await expect(service.getById('post-1')).rejects.toThrow('Post not found');
    });
  });

  describe('update', () => {
    it('rejects any status transition other than DRAFT -> PUBLISHED', async () => {
      prisma.communityPost.findUnique.mockResolvedValue({
        id: 'post-1',
        authorId: 'author-1',
        status: 'PUBLISHED',
      });

      await expect(
        service.update('author-1', 'post-1', { status: 'DRAFT' } as any),
      ).rejects.toThrow('Only a draft can be published');
    });

    it('allows publishing a draft', async () => {
      prisma.communityPost.findUnique.mockResolvedValue({
        id: 'post-1',
        authorId: 'author-1',
        status: 'DRAFT',
      });
      prisma.communityPost.update.mockResolvedValue({
        id: 'post-1',
        author: fakeAuthor(),
        space: { id: 'space-1', name: 'General', slug: 'general' },
        tags: [],
        attachments: [],
      });

      await service.update('author-1', 'post-1', { status: 'PUBLISHED' } as any);
      expect(prisma.communityPost.update.mock.calls[0][0].data.status).toBe('PUBLISHED');
    });
  });

  describe('list', () => {
    it('filters by tagId when provided', async () => {
      await service.list('user-1', { tagId: 'tag-1' } as any);
      expect(prisma.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { some: { tagId: 'tag-1' } } }),
        }),
      );
    });
  });

  describe('listMine', () => {
    it('includes drafts and excludes only deleted posts', async () => {
      await service.listMine('author-1');
      expect(prisma.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: 'author-1', status: { not: 'DELETED' } },
        }),
      );
    });
  });
});
