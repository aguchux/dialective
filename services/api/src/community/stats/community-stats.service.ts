import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CommunityStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cheap aggregate counts for a "join the community" CTA elsewhere in the
   * app (e.g. the trainer dashboard home view) -- deliberately just four
   * indexed counts, no joins, so it's safe to call on every dashboard load
   * rather than needing its own cache/cron.
   */
  async getStats() {
    const since24h = new Date(Date.now() - DAY_MS);
    const [memberCount, postCount, spaceCount, postsLast24h] = await Promise.all([
      this.prisma.communityProfile.count(),
      this.prisma.communityPost.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.communitySpace.count(),
      this.prisma.communityPost.count({
        where: { status: 'PUBLISHED', createdAt: { gte: since24h } },
      }),
    ]);
    return { memberCount, postCount, spaceCount, postsLast24h };
  }
}
