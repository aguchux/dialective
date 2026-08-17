import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SystemUpdateKind, SystemUpdateSourceType, UserStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSystemUpdateDto } from './dto/create-system-update.dto';

const PAGE_SIZE = 25;

interface PublishUpdateInput {
  kind: SystemUpdateKind;
  title: string;
  message: string;
  href?: string | null;
  authorId?: string | null;
  sourceType?: SystemUpdateSourceType;
  sourceId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createManualUpdate(authorId: string, dto: CreateSystemUpdateDto) {
    return this.publishUpdate({
      kind: dto.kind,
      title: dto.title,
      message: dto.message,
      href: cleanHref(dto.href),
      authorId,
      sourceType: SystemUpdateSourceType.MANUAL,
    });
  }

  async notifyBlogPublished(authorId: string, post: { id: string; title: string; excerpt?: string | null; slug: string }) {
    return this.publishUpdate({
      kind: SystemUpdateKind.BLOG,
      title: `New blog: ${post.title}`,
      message: post.excerpt || 'A new Dialect Library article is available.',
      href: `/blog/${post.slug}`,
      authorId,
      sourceType: SystemUpdateSourceType.BLOG_POST,
      sourceId: post.id,
    });
  }

  async notifyCoursePublished(authorId: string, course: { id: string; title: string; summary: string; slug: string }) {
    return this.publishUpdate({
      kind: SystemUpdateKind.COURSE,
      title: `New course: ${course.title}`,
      message: course.summary,
      href: `/learn/${course.slug}`,
      authorId,
      sourceType: SystemUpdateSourceType.COURSE,
      sourceId: course.id,
    });
  }

  async publishUpdate(input: PublishUpdateInput) {
    const sourceType = input.sourceType ?? SystemUpdateSourceType.MANUAL;
    const sourceId = input.sourceId ?? null;
    const title = input.title.trim();
    const message = input.message.trim();
    if (!title || !message) throw new BadRequestException('Notification title and message are required');

    const existing = sourceId
      ? await this.prisma.systemUpdate.findUnique({
          where: { sourceType_sourceId: { sourceType, sourceId } },
          select: { id: true },
        })
      : null;
    if (existing) return { updateId: existing.id, recipients: 0, duplicate: true };

    const recipients = await this.prisma.user.findMany({
      where: recipientWhere(input.kind),
      select: { id: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const update = await tx.systemUpdate.create({
        data: {
          kind: input.kind,
          sourceType,
          sourceId,
          title,
          message,
          href: input.href ?? null,
          authorId: input.authorId ?? null,
        },
      });
      if (recipients.length) {
        await tx.userNotification.createMany({
          data: recipients.map((user) => ({ userId: user.id, updateId: update.id })),
          skipDuplicates: true,
        });
      }
      return update;
    });

    return { updateId: result.id, recipients: recipients.length, duplicate: false };
  }

  async listAdminUpdates() {
    return this.prisma.systemUpdate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        author: { select: { email: true, firstName: true, lastName: true } },
        _count: { select: { notifications: true } },
      },
    });
  }

  async listForUser(userId: string, page = 1) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { update: true },
      }),
      this.prisma.userNotification.count({ where: { userId } }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map(toNotificationDto),
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      unreadCount,
    };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.userNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.userNotification.findFirst({ where: { id, userId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { id, read: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

function recipientWhere(kind: SystemUpdateKind): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { status: UserStatus.ACTIVE };
  if (kind === SystemUpdateKind.BLOG) return { ...base, blogNewsNotificationsEnabled: true };
  if (kind === SystemUpdateKind.COURSE) return { ...base, courseNotificationsEnabled: true };
  return base;
}

function cleanHref(value?: string): string | null {
  const clean = value?.trim();
  return clean || null;
}

function toNotificationDto(row: Prisma.UserNotificationGetPayload<{ include: { update: true } }>) {
  return {
    id: row.id,
    readAt: row.readAt,
    createdAt: row.createdAt,
    update: {
      id: row.update.id,
      kind: row.update.kind,
      title: row.update.title,
      message: row.update.message,
      href: row.update.href,
      createdAt: row.update.createdAt,
    },
  };
}
