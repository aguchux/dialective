import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CommunityBookmarksService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.communityBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
            space: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  }
}
