import { Injectable, NotFoundException } from '@nestjs/common';
import { CommunityModeratorActionType, CommunityReportTargetType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunityNotificationsService } from '../notifications/community-notifications.service';
import { CommunityPostsService } from '../posts/community-posts.service';
import { CommunityRepliesService } from '../replies/community-replies.service';

@Injectable()
export class CommunityModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: CommunityPostsService,
    private readonly replies: CommunityRepliesService,
    private readonly notifications: CommunityNotificationsService,
  ) {}

  /** Every moderator action is logged (COMMUNITY-PLAN.md §24.4) -- called by every action method below. */
  private async logAction(
    moderatorId: string,
    targetType: CommunityReportTargetType,
    targetId: string,
    action: CommunityModeratorActionType,
    reason?: string,
  ) {
    await this.prisma.communityModeratorAction.create({
      data: { moderatorId, targetType, targetId, action, reason },
    });
  }

  async hidePost(moderatorId: string, postId: string, reason?: string) {
    const post = await this.posts.setStatusForModeration(postId, 'HIDDEN');
    await this.logAction(moderatorId, 'POST', postId, 'HIDE_POST', reason);
    return post;
  }

  async restorePost(moderatorId: string, postId: string) {
    const post = await this.posts.setStatusForModeration(postId, 'PUBLISHED');
    await this.logAction(moderatorId, 'POST', postId, 'RESTORE_POST');
    return post;
  }

  async deletePost(moderatorId: string, postId: string, reason?: string) {
    const post = await this.posts.setStatusForModeration(postId, 'DELETED');
    await this.logAction(moderatorId, 'POST', postId, 'DELETE_POST', reason);
    return post;
  }

  async lockThread(moderatorId: string, postId: string) {
    const post = await this.posts.setLocked(postId, true);
    await this.logAction(moderatorId, 'POST', postId, 'LOCK_THREAD');
    return post;
  }

  async unlockThread(moderatorId: string, postId: string) {
    const post = await this.posts.setLocked(postId, false);
    await this.logAction(moderatorId, 'POST', postId, 'UNLOCK_THREAD');
    return post;
  }

  async deleteReply(moderatorId: string, replyId: string, reason?: string) {
    const reply = await this.replies.setStatusForModeration(replyId, 'DELETED');
    await this.logAction(moderatorId, 'REPLY', replyId, 'DELETE_REPLY', reason);
    return reply;
  }

  async warnUser(moderatorId: string, profileId: string, reason: string) {
    const profile = await this.prisma.communityProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Community profile not found');
    await this.logAction(moderatorId, 'PROFILE', profileId, 'WARN_USER', reason);
    void this.notifications.notify({
      userId: profile.userId,
      type: 'MODERATION_ACTION',
      title: 'Community warning',
      message: reason,
    });
  }

  async suspendUser(moderatorId: string, profileId: string, reason?: string) {
    const profile = await this.setStatus(profileId, 'SUSPENDED');
    await this.logAction(moderatorId, 'PROFILE', profileId, 'SUSPEND_USER', reason);
    return profile;
  }

  async banUser(moderatorId: string, profileId: string, reason?: string) {
    const profile = await this.setStatus(profileId, 'BANNED');
    await this.logAction(moderatorId, 'PROFILE', profileId, 'BAN_USER', reason);
    return profile;
  }

  async restoreUser(moderatorId: string, profileId: string) {
    const profile = await this.setStatus(profileId, 'ACTIVE');
    await this.logAction(moderatorId, 'PROFILE', profileId, 'RESTORE_USER');
    return profile;
  }

  async pinPost(moderatorId: string, postId: string) {
    const post = await this.posts.setPinned(postId, true);
    await this.logAction(moderatorId, 'POST', postId, 'PIN_POST');
    return post;
  }

  async unpinPost(moderatorId: string, postId: string) {
    const post = await this.posts.setPinned(postId, false);
    await this.logAction(moderatorId, 'POST', postId, 'UNPIN_POST');
    return post;
  }

  async listAuditLog() {
    return this.prisma.communityModeratorAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { moderator: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  /** COMMUNITY-PLAN.md §48: Community suspension must never suspend the main Dialect Library account. */
  private async setStatus(profileId: string, status: 'ACTIVE' | 'SUSPENDED' | 'BANNED') {
    const profile = await this.prisma.communityProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Community profile not found');
    return this.prisma.communityProfile.update({ where: { id: profileId }, data: { status } });
  }
}
