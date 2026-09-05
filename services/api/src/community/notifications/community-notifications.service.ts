import { Injectable, Logger } from '@nestjs/common';
import { CommunityNotificationType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

const PAGE_SIZE = 30;

@Injectable()
export class CommunityNotificationsService {
  private readonly logger = new Logger(CommunityNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws -- a failed notification write must not break the reply/
   * reaction/report action that triggered it, same posture as
   * OrgActivityService.record and StreamAccessLogService.record elsewhere
   * in this codebase. Never notifies a user about their own action (e.g.
   * replying to your own post).
   */
  async notify(params: {
    userId: string;
    type: CommunityNotificationType;
    actorId?: string;
    postId?: string;
    replyId?: string;
    title: string;
    message: string;
  }): Promise<void> {
    if (params.actorId && params.actorId === params.userId) return;
    try {
      await this.prisma.communityNotification.create({
        data: {
          userId: params.userId,
          type: params.type,
          actorId: params.actorId,
          postId: params.postId,
          replyId: params.replyId,
          title: params.title,
          message: params.message,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to create community notification for user=${params.userId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async list(userId: string, tab?: 'replies' | 'mentions' | 'announcements') {
    const typeFilter: Record<string, CommunityNotificationType[]> = {
      replies: ['REPLY_TO_POST', 'REPLY_TO_REPLY'],
      mentions: ['MENTION'],
      announcements: ['ANNOUNCEMENT'],
    };
    return this.prisma.communityNotification.findMany({
      where: { userId, ...(tab ? { type: { in: typeFilter[tab] } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: { actor: { select: { firstName: true, lastName: true } } },
    });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.communityNotification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.communityNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
