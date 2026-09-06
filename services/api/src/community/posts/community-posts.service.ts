import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { renderCommunityBody } from '../community-content.util';
import { slugifyUnique } from '../community-slug.util';
import { attachmentsCreateInput, toAttachmentDto } from '../community-attachments.util';
import { AUTHOR_SUMMARY_SELECT, AuthorSummarySource, toAuthorSummary } from '../profiles/community-profiles.service';
import { CreateCommunityPostDto } from '../dto/create-community-post.dto';
import { UpdateCommunityPostDto } from '../dto/update-community-post.dto';
import { ListCommunityPostsDto } from '../dto/list-community-posts.dto';
import { CommunityProfilesService } from '../profiles/community-profiles.service';
import { CommunityTagsService } from '../tags/community-tags.service';
import { CommunitySettingsService } from '../settings/community-settings.service';

const PAGE_SIZE = 20;

function postCardInclude(userId?: string) {
  return {
    author: { select: AUTHOR_SUMMARY_SELECT },
    space: { select: { id: true, name: true, slug: true } },
    tags: { include: { tag: true } },
    attachments: true,
    ...(userId
      ? {
          reactions: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
        }
      : {}),
  } as const;
}

@Injectable()
export class CommunityPostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: CommunityProfilesService,
    private readonly tags: CommunityTagsService,
    private readonly storage: StorageService,
    private readonly settings: CommunitySettingsService,
  ) {}

  async create(userId: string, dto: CreateCommunityPostDto) {
    if (!(await this.settings.isPostingEnabled())) {
      throw new ForbiddenException('Posting is currently disabled for the Community');
    }
    const profile = await this.profiles.ensureProfile(userId);
    if (await this.settings.isApprovalRequiredForNewMembers()) {
      throw new ForbiddenException(
        'New members require moderator approval before posting -- this will be enabled in a future update',
      );
    }
    const delayMinutes = await this.settings.getNewMemberPostingDelayMinutes();
    if (delayMinutes > 0) {
      const eligibleAt = new Date(profile.createdAt.getTime() + delayMinutes * 60_000);
      if (new Date() < eligibleAt) {
        throw new ForbiddenException(
          `New members can post ${delayMinutes} minutes after joining the Community`,
        );
      }
    }
    const space = await this.prisma.communitySpace.findUnique({ where: { id: dto.spaceId } });
    if (!space || space.isArchived) throw new NotFoundException('Space not found');

    const tagIds = dto.tags?.length ? await this.tags.resolveOrCreateMany(dto.tags) : [];
    const post = await this.prisma.communityPost.create({
      data: {
        authorId: userId,
        spaceId: dto.spaceId,
        title: dto.title.trim(),
        slug: slugifyUnique(dto.title),
        body: renderCommunityBody(dto.body),
        status: dto.status ?? 'PUBLISHED',
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        attachments: dto.attachments?.length
          ? { create: attachmentsCreateInput(dto.attachments) }
          : undefined,
      },
      include: postCardInclude(userId),
    });
    await this.prisma.communityProfile.update({
      where: { userId },
      data: { postCount: { increment: 1 } },
    });
    return this.toCard(post);
  }

  async update(userId: string, postId: string, dto: UpdateCommunityPostDto) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.status === 'DELETED') throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException('You can only edit your own post');
    if (dto.status && !(post.status === 'DRAFT' && dto.status === 'PUBLISHED')) {
      throw new ForbiddenException('Only a draft can be published from here');
    }

    const tagIds = dto.tags !== undefined ? await this.tags.resolveOrCreateMany(dto.tags) : undefined;
    const updated = await this.prisma.communityPost.update({
      where: { id: postId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: renderCommunityBody(dto.body) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(tagIds !== undefined
          ? { tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } }
          : {}),
        ...(dto.attachments !== undefined
          ? {
              attachments: {
                deleteMany: {},
                create: attachmentsCreateInput(dto.attachments),
              },
            }
          : {}),
      },
      include: postCardInclude(userId),
    });
    return this.toCard(updated);
  }

  async delete(userId: string, postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.status === 'DELETED') throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException('You can only delete your own post');
    await this.prisma.communityPost.update({
      where: { id: postId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }

  /** Accepts either a UUID id or the post's slug -- the frontend always routes by slug. */
  async getById(idOrSlug: string, userId?: string) {
    const post = await this.prisma.communityPost.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: postCardInclude(userId),
    });
    if (!post || post.status === 'DELETED' || post.status === 'HIDDEN') {
      throw new NotFoundException('Post not found');
    }
    await this.prisma.communityPost.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } });
    return this.toCard(post);
  }

  async list(userId: string | undefined, query: ListCommunityPostsDto) {
    const where = {
      status: 'PUBLISHED' as const,
      ...(query.spaceId ? { spaceId: query.spaceId } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.tab === 'unanswered' ? { replyCount: 0 } : {}),
    };

    // "For You" is personal (joined-spaces first) and has no meaning for an
    // anonymous request -- the community frontend already substitutes
    // 'latest' when signed out, this is just a safety net for a direct API
    // call with no session.
    if (query.tab === 'for-you' && userId) {
      return this.listForYou(userId, where);
    }

    const posts = await this.prisma.communityPost.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: postCardInclude(userId),
    });
    return this.toCursorPage(posts);
  }

  /** Full post-card search results, reusing the same author/reaction/bookmark join as every other listing -- backs CommunitySearchService. */
  async searchCards(term: string, userId: string | undefined, limit: number) {
    const posts = await this.prisma.communityPost.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ title: { contains: term, mode: 'insensitive' } }, { body: { contains: term, mode: 'insensitive' } }],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: postCardInclude(userId),
    });
    return posts.map((post) => this.toCard(post));
  }

  /** Every post authored by the caller, including drafts -- backs My Posts. */
  async listMine(userId: string, cursor?: string) {
    const posts = await this.prisma.communityPost.findMany({
      where: { authorId: userId, status: { not: 'DELETED' } },
      orderBy: [{ createdAt: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: postCardInclude(userId),
    });
    return this.toCursorPage(posts);
  }

  /**
   * MVP heuristic (COMMUNITY-PLAN.md §11.3): posts from the member's joined
   * spaces first, falling back to recent posts across every space once that
   * pool is exhausted -- no ML feed required.
   */
  private async listForYou(userId: string, baseWhere: Record<string, unknown>) {
    const profile = await this.prisma.communityProfile.findUnique({
      where: { userId },
      include: { spaceMemberships: { select: { spaceId: true } } },
    });
    const joinedSpaceIds = profile?.spaceMemberships.map((m) => m.spaceId) ?? [];

    const fromJoinedSpaces = joinedSpaceIds.length
      ? await this.prisma.communityPost.findMany({
          where: { ...baseWhere, spaceId: { in: joinedSpaceIds } },
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          take: PAGE_SIZE + 1,
          include: postCardInclude(userId),
        })
      : [];

    // "Falling back to recent posts once that pool is exhausted" (see doc
    // comment above) means exactly that -- not just "the member has joined
    // zero spaces". A member who joined one quiet space would otherwise
    // never see any post from a space they haven't joined, no matter how
    // few posts their own joined spaces have. Top up with the most recent
    // posts platform-wide (excluding ones already included) whenever the
    // joined-spaces page came back short of a full page.
    const posts =
      fromJoinedSpaces.length >= PAGE_SIZE + 1
        ? fromJoinedSpaces
        : [
            ...fromJoinedSpaces,
            ...(await this.prisma.communityPost.findMany({
              where: {
                ...baseWhere,
                ...(fromJoinedSpaces.length
                  ? { id: { notIn: fromJoinedSpaces.map((p) => p.id as string) } }
                  : {}),
              },
              orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
              take: PAGE_SIZE + 1 - fromJoinedSpaces.length,
              include: postCardInclude(userId),
            })),
          ];
    return this.toCursorPage(posts);
  }

  // --- admin/moderator ---

  async setPinned(postId: string, isPinned: boolean) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.communityPost.update({ where: { id: postId }, data: { isPinned } });
  }

  async setLocked(postId: string, isLocked: boolean) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.communityPost.update({ where: { id: postId }, data: { isLocked } });
  }

  async setStatusForModeration(postId: string, status: 'PUBLISHED' | 'HIDDEN' | 'DELETED') {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.communityPost.update({
      where: { id: postId },
      data: { status, deletedAt: status === 'DELETED' ? new Date() : null },
    });
  }

  private toCursorPage(posts: Array<Record<string, unknown>>) {
    const hasMore = posts.length > PAGE_SIZE;
    const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
    return {
      items: page.map((p) => this.toCard(p)),
      nextCursor: hasMore ? (page[page.length - 1] as { id: string }).id : null,
    };
  }

  private toCard(post: Record<string, unknown>) {
    const { tags, author, reactions, bookmarks, attachments, ...rest } = post as {
      tags: Array<{ tag: unknown }>;
      author: AuthorSummarySource;
      reactions?: unknown[];
      bookmarks?: unknown[];
      attachments?: Parameters<typeof toAttachmentDto>[1][];
    } & Record<string, unknown>;
    return {
      ...rest,
      author: toAuthorSummary(author),
      tags: tags.map((t) => t.tag),
      attachments: (attachments ?? []).map((attachment) => toAttachmentDto(this.storage, attachment)),
      likedByMe: reactions !== undefined ? reactions.length > 0 : undefined,
      bookmarkedByMe: bookmarks !== undefined ? bookmarks.length > 0 : undefined,
    };
  }
}
