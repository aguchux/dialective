import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { toAttachmentDto } from '../community-attachments.util';
import {
  AUTHOR_SUMMARY_SELECT,
  AuthorSummarySource,
  toAuthorSummary,
} from '../profiles/community-profiles.service';

@Injectable()
export class CommunityBookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async add(userId: string, postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.prisma.communityBookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) return;
    await this.prisma.$transaction([
      this.prisma.communityBookmark.create({ data: { userId, postId } }),
      this.prisma.communityProfile.update({
        where: { userId },
        data: { bookmarkCount: { increment: 1 } },
      }),
    ]);
  }

  async remove(userId: string, postId: string) {
    const existing = await this.prisma.communityBookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) return;
    await this.prisma.$transaction([
      this.prisma.communityBookmark.delete({ where: { id: existing.id } }),
      this.prisma.communityProfile.update({
        where: { userId },
        data: { bookmarkCount: { decrement: 1 } },
      }),
    ]);
  }

  async listMine(userId: string) {
    const bookmarks = await this.prisma.communityBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: {
            author: { select: AUTHOR_SUMMARY_SELECT },
            space: { select: { id: true, name: true, slug: true } },
            tags: { include: { tag: true } },
            attachments: true,
            reactions: { where: { userId }, select: { type: true } },
            bookmarks: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    return bookmarks.map(({ post }) => {
      const {
        tags,
        attachments,
        reactions,
        bookmarks: _bookmarks,
        author,
        ...rest
      } = post as typeof post & {
        author: AuthorSummarySource;
      };
      return {
        ...rest,
        author: toAuthorSummary(author),
        tags: tags.map(({ tag }) => tag),
        attachments: attachments.map((attachment) => toAttachmentDto(this.storage, attachment)),
        likedByMe: reactions.some(({ type }) => type === 'LIKE'),
        reactionTypeByMe: reactions[0]?.type ?? null,
        bookmarkedByMe: true,
      };
    });
  }
}
