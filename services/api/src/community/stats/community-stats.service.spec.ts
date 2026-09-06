import { CommunityStatsService } from './community-stats.service';

describe('CommunityStatsService', () => {
  function setup() {
    const prisma = {
      communityProfile: { count: jest.fn().mockResolvedValue(120) },
      communityPost: { count: jest.fn().mockResolvedValue(0) },
      communitySpace: { count: jest.fn().mockResolvedValue(5) },
    };
    const service = new CommunityStatsService(prisma as never);
    return { service, prisma };
  }

  it('returns member/post/space counts and posts in the last 24h', async () => {
    const { service, prisma } = setup();
    prisma.communityPost.count.mockResolvedValueOnce(340).mockResolvedValueOnce(12);

    const result = await service.getStats();

    expect(result).toEqual({
      memberCount: 120,
      postCount: 340,
      spaceCount: 5,
      postsLast24h: 12,
    });
  });

  it('scopes both post counts to PUBLISHED status only', async () => {
    const { service, prisma } = setup();

    await service.getStats();

    expect(prisma.communityPost.count).toHaveBeenNthCalledWith(1, {
      where: { status: 'PUBLISHED' },
    });
    expect(prisma.communityPost.count).toHaveBeenNthCalledWith(2, {
      where: { status: 'PUBLISHED', createdAt: { gte: expect.any(Date) } },
    });
  });
});
