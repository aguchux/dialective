import { CommunityReactionsService } from './community-reactions.service';

describe('CommunityReactionsService', () => {
  function setup(reactionsEnabled = true) {
    const prisma = {
      communityPost: {
        findUnique: jest.fn().mockResolvedValue({ id: 'post-1' }),
        update: jest.fn(),
      },
      communityReply: {
        findUnique: jest.fn().mockResolvedValue({ id: 'reply-1' }),
        update: jest.fn(),
      },
      communityReaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const settings = { isReactionsEnabled: jest.fn().mockResolvedValue(reactionsEnabled) };
    const service = new CommunityReactionsService(prisma as never, settings as never);
    return { service, prisma, settings };
  }

  it('refuses to like a post when reactions are disabled', async () => {
    const { service, prisma } = setup(false);

    await expect(service.likePost('user-1', 'post-1')).rejects.toThrow(
      'Reactions are currently disabled',
    );
    expect(prisma.communityPost.findUnique).not.toHaveBeenCalled();
  });

  it('refuses to like a reply when reactions are disabled', async () => {
    const { service, prisma } = setup(false);

    await expect(service.likeReply('user-1', 'reply-1')).rejects.toThrow(
      'Reactions are currently disabled',
    );
    expect(prisma.communityReply.findUnique).not.toHaveBeenCalled();
  });

  it('allows liking a post when reactions are enabled', async () => {
    const { service, prisma } = setup(true);

    await service.likePost('user-1', 'post-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not gate unliking a post', async () => {
    const { service, prisma } = setup(false);
    prisma.communityReaction.findUnique.mockResolvedValue({ id: 'reaction-1' });

    await service.unlikePost('user-1', 'post-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
