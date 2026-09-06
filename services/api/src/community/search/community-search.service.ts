import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunityPostsService } from '../posts/community-posts.service';

const RESULT_LIMIT = 10;

/**
 * MVP search (COMMUNITY-PLAN.md §21.2): plain ILIKE across posts/tags/
 * spaces/profiles -- no dedicated search infrastructure required. Revisit
 * with Postgres trigram/full-text indexes if ILIKE scan cost becomes
 * measurable at real data volume.
 */
@Injectable()
export class CommunitySearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: CommunityPostsService,
  ) {}

  async search(query: string, userId?: string) {
    const term = query.trim();
    if (!term) return { posts: [], tags: [], spaces: [], profiles: [] };

    const [posts, tags, spaces, profiles] = await Promise.all([
      // Delegates to CommunityPostsService so search results carry the same
      // full card shape (author/badge, tags, attachments, likedByMe,
      // bookmarkedByMe) as every other post listing in the app, instead of
      // a bespoke {id, title, slug}-only projection the frontend can't
      // render as a real PostCard.
      this.posts.searchCards(term, userId, RESULT_LIMIT),
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
