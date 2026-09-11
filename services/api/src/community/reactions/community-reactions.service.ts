import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      this.prisma.communityPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);
  }

  rejectInvalidType(): never {
    throw new BadRequestException('Unsupported reaction type');
  }

  async reactPost(userId: string, postId: string, type: 'HAPPY' | 'SMILE' | 'LOL' | 'SAD' | 'CRY') {
    if (!(await this.settings.isReactionsEnabled())) {
      throw new ForbiddenException('Reactions are currently disabled for the Community');
    }
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    const field = `${type.toLowerCase()}Count` as
      'happyCount' | 'smileCount' | 'lolCount' | 'sadCount' | 'cryCount';
    if (existing?.type === type) return this.removePostReaction(userId, postId);
    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        const oldField = `${String(existing.type).toLowerCase()}Count`;
        if (oldField !== 'likeCount') {
          await tx.communityPost.update({
            where: { id: postId },
            data: { [oldField]: { decrement: 1 } },
          });
        } else {
          await tx.communityPost.update({
            where: { id: postId },
            data: { likeCount: { decrement: 1 } },
          });
        }
        await tx.communityReaction.update({ where: { id: existing.id }, data: { type } });
      } else {
        await tx.communityReaction.create({ data: { userId, postId, type } });
      }
      await tx.communityPost.update({ where: { id: postId }, data: { [field]: { increment: 1 } } });
    });
  }

  async removePostReaction(userId: string, postId: string) {
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) return;
    const field = `${String(existing.type).toLowerCase()}Count`;
    await this.prisma.$transaction([
      this.prisma.communityReaction.delete({ where: { id: existing.id } }),
      this.prisma.communityPost.update({
        where: { id: postId },
        data: { [field]: { decrement: 1 } },
      }),
    ]);
  }

  async unlikePost(userId: string, postId: string) {
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    // Keep older unit-test/mocked records compatible while ensuring a heart
    // action cannot remove one of the newer emoji reactions.
    if (!existing || (existing.type && existing.type !== 'LIKE')) return;
    await this.prisma.$transaction([
      this.prisma.communityReaction.delete({ where: { id: existing.id } }),
      this.prisma.communityPost.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      }),
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
      this.prisma.communityReply.update({
        where: { id: replyId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);
  }

  async unlikeReply(userId: string, replyId: string) {
    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (!existing) return;
    await this.prisma.$transaction([
      this.prisma.communityReaction.delete({ where: { id: existing.id } }),
      this.prisma.communityReply.update({
        where: { id: replyId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);
  }
}
