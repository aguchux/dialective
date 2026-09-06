import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunitySettingsService } from '../settings/community-settings.service';

@Injectable()
export class CommunityReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CommunitySettingsService,
  ) {}

  async likePost(userId: string, postId: string) {
    if (!(await this.settings.isReactionsEnabled())) {
      throw new ForbiddenException('Reactions are currently disabled for the Community');
    }
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) return; // already liked -- idempotent
    await this.prisma.$transaction([
      this.prisma.communityReaction.create({ data: { userId, postId } }),
      this.prisma.communityPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);
  }

  async unlikePost(userId: string, postId: string) {
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) return;
    await this.prisma.$transaction([
      this.prisma.communityReaction.delete({ where: { id: existing.id } }),
      this.prisma.communityPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
    ]);
  }

  async likeReply(userId: string, replyId: string) {
    if (!(await this.settings.isReactionsEnabled())) {
      throw new ForbiddenException('Reactions are currently disabled for the Community');
    }
    const reply = await this.prisma.communityReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Reply not found');
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (existing) return;
    await this.prisma.$transaction([
      this.prisma.communityReaction.create({ data: { userId, replyId } }),
      this.prisma.communityReply.update({ where: { id: replyId }, data: { likeCount: { increment: 1 } } }),
    ]);
  }

  async unlikeReply(userId: string, replyId: string) {
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (!existing) return;
    await this.prisma.$transaction([
      this.prisma.communityReaction.delete({ where: { id: existing.id } }),
      this.prisma.communityReply.update({ where: { id: replyId }, data: { likeCount: { decrement: 1 } } }),
    ]);
  }
}
