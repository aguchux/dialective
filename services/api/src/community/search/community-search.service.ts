import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const RESULT_LIMIT = 10;

/**
 * MVP search (COMMUNITY-PLAN.md §21.2): plain ILIKE across posts/tags/
 * spaces/profiles -- no dedicated search infrastructure required. Revisit
 * with Postgres trigram/full-text indexes if ILIKE scan cost becomes
 * measurable at real data volume.
 */
@Injectable()
export class CommunitySearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string) {
    const term = query.trim();
    if (!term) return { posts: [], tags: [], spaces: [], profiles: [] };

    const [posts, tags, spaces, profiles] = await Promise.all([
      this.prisma.communityPost.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [{ title: { contains: term, mode: 'insensitive' } }, { body: { contains: term, mode: 'insensitive' } }],
        },
        take: RESULT_LIMIT,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true },
      }),
      this.prisma.communityTag.findMany({
        where: { isHidden: false, name: { contains: term, mode: 'insensitive' } },
        take: RESULT_LIMIT,
      }),
      this.prisma.communitySpace.findMany({
        where: { isArchived: false, name: { contains: term, mode: 'insensitive' } },
        take: RESULT_LIMIT,
      }),
      this.prisma.communityProfile.findMany({
        where: { displayName: { contains: term, mode: 'insensitive' } },
        take: RESULT_LIMIT,
        select: { id: true, userId: true, displayName: true },
      }),
    ]);

    return { posts, tags, spaces, profiles };
  }
}
