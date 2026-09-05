import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { renderCommunityBody } from '../community-content.util';
import { CreateCommunityReplyDto } from '../dto/create-community-reply.dto';
import { CommunityProfilesService } from '../profiles/community-profiles.service';
import { CommunityNotificationsService } from '../notifications/community-notifications.service';

@Injectable()
export class CommunityRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: CommunityProfilesService,
    private readonly notifications: CommunityNotificationsService,
  ) {}

  async list(postId: string) {
    return this.prisma.communityReply.findMany({
      where: { postId, status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async create(userId: string, postId: string, dto: CreateCommunityReplyDto) {
    await this.profiles.ensureProfile(userId);
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.status === 'DELETED') throw new NotFoundException('Post not found');
    if (post.isLocked) throw new ForbiddenException('This discussion is locked');

    let parent: { id: string; parentReplyId: string | null; authorId: string } | null = null;
    if (dto.parentReplyId) {
      parent = await this.prisma.communityReply.findUnique({ where: { id: dto.parentReplyId } });
      if (!parent || parent.parentReplyId) {
        // MVP supports exactly one level of nesting -- a reply whose
        // parent already has a parent would create a third level.
        throw new BadRequestException('Replies can only be nested one level deep');
      }
    }

    const [reply] = await this.prisma.$transaction([
      this.prisma.communityReply.create({
        data: {
          postId,
          authorId: userId,
          parentReplyId: dto.parentReplyId,
          body: renderCommunityBody(dto.body),
        },
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.communityPost.update({ where: { id: postId }, data: { replyCount: { increment: 1 } } }),
      this.prisma.communityProfile.update({
        where: { userId },
        data: { replyCount: { increment: 1 } },
      }),
    ]);

    if (parent) {
      void this.notifications.notify({
        userId: parent.authorId,
        actorId: userId,
        type: 'REPLY_TO_REPLY',
        replyId: reply.id,
        postId,
        title: 'New reply to your comment',
        message: 'Someone replied to your comment.',
      });
    } else {
      void this.notifications.notify({
        userId: post.authorId,
        actorId: userId,
        type: 'REPLY_TO_POST',
        replyId: reply.id,
        postId,
        title: 'New reply to your post',
        message: `Someone replied to "${post.title}".`,
      });
    }

    return reply;
  }

  async update(userId: string, replyId: string, body: string) {
    const reply = await this.prisma.communityReply.findUnique({ where: { id: replyId } });
    if (!reply || reply.status === 'DELETED') throw new NotFoundException('Reply not found');
    if (reply.authorId !== userId) throw new ForbiddenException('You can only edit your own reply');
    return this.prisma.communityReply.update({
      where: { id: replyId },
      data: { body: renderCommunityBody(body) },
    });
  }

  async delete(userId: string, replyId: string) {
    const reply = await this.prisma.communityReply.findUnique({ where: { id: replyId } });
    if (!reply || reply.status === 'DELETED') throw new NotFoundException('Reply not found');
    if (reply.authorId !== userId) throw new ForbiddenException('You can only delete your own reply');
    await this.prisma.$transaction([
      this.prisma.communityReply.update({
        where: { id: replyId },
        data: { status: 'DELETED', deletedAt: new Date() },
      }),
      this.prisma.communityPost.update({
        where: { id: reply.postId },
        data: { replyCount: { decrement: 1 } },
      }),
    ]);
  }

  async setStatusForModeration(replyId: string, status: 'PUBLISHED' | 'HIDDEN' | 'DELETED') {
    const reply = await this.prisma.communityReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Reply not found');
    return this.prisma.communityReply.update({
      where: { id: replyId },
      data: { status, deletedAt: status === 'DELETED' ? new Date() : null },
    });
  }
}
