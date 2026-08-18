import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BlogPostStatus, CourseVisibility, creditCourseCompletionReward, Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ReorderCoursesDto } from './dto/reorder-courses.dto';
import { CourseDocument, validateCourseDocument } from './course-content.util';

const authorSelect = { email: true } as const;

// Slugs are never client-supplied: always `${slugified title}-${id}`, same
// pattern as BlogService.slugFor -- uniqueness comes for free from the id.
function slugFor(title: string, id: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150);
  return `${base || 'course'}-${id}`;
}

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async listPublished() {
    return this.prisma.course.findMany({
      where: { status: BlogPostStatus.PUBLISHED },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
      select: {
        id: true, slug: true, title: true, summary: true, visibility: true,
        coverImageUrl: true, coverImageAlt: true, publishedAt: true,
        createdAt: true, updatedAt: true,
      },
    });
  }

  async getPublishedPreview(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: {
        id: true, slug: true, title: true, summary: true, visibility: true,
        coverImageUrl: true, coverImageAlt: true, publishedAt: true,
        createdAt: true, updatedAt: true, slides: true,
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const { slides, ...preview } = course;
    const slideCount = (slides as unknown as CourseDocument).slides.length;
    return { ...preview, slideCount };
  }

  /**
   * Full course incl. slides + this user's saved progress, gated to
   * PUBLISHED only -- a draft/removed slug 404s the same as a nonexistent
   * one so drafts are never distinguishable from "doesn't exist" to a
   * non-admin caller.
   */
  async getForStudy(userId: string, slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
    });
    if (!course) throw new NotFoundException('Course not found');

    const progress = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      coverImageUrl: course.coverImageUrl,
      coverImageAlt: course.coverImageAlt,
      slides: (course.slides as unknown as CourseDocument).slides,
      progress: progress ? { lastSlideIndex: progress.lastSlideIndex, completedAt: progress.completedAt } : null,
    };
  }

  /**
   * Same shape as getForStudy but no auth, no progress -- only ever called
   * for visibility=PUBLIC courses (CoursesPublicController checks that
   * before calling this, see courses.controller.ts). A PRIVATE course's
   * slug 404s here the same as a draft/nonexistent one, so this endpoint
   * can never be used to read a private course's content without logging in.
   */
  async getPublicForStudy(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED, visibility: CourseVisibility.PUBLIC },
    });
    if (!course) throw new NotFoundException('Course not found');

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      coverImageUrl: course.coverImageUrl,
      coverImageAlt: course.coverImageAlt,
      slides: (course.slides as unknown as CourseDocument).slides,
    };
  }

  async saveProgress(userId: string, slug: string, lastSlideIndex: number, totalSlides: number) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: { id: true, title: true, completionRewardTokens: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    const existingProgress = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { completedAt: true },
    });
    const wasAlreadyComplete = existingProgress?.completedAt != null;

    const clampedIndex = Math.min(Math.max(0, lastSlideIndex), Math.max(0, totalSlides - 1));
    const completedAt = clampedIndex >= totalSlides - 1 ? new Date() : null;

    const progress = await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      create: { userId, courseId: course.id, lastSlideIndex: clampedIndex, completedAt },
      // Once completed, a later re-save with a smaller index (e.g. the
      // trainer navigates back to review a slide) shouldn't un-complete the
      // course -- completedAt only ever gets set, never cleared.
      update: {
        lastSlideIndex: clampedIndex,
        ...(completedAt && { completedAt }),
      },
    });

    // Reward credit + completion email fire once, the instant this trainer's
    // completedAt is first set for this course -- never on a later re-save
    // (already-complete rows never null out completedAt, so
    // wasAlreadyComplete alone is enough to detect the transition without a
    // separate "just completed" flag).
    if (progress.completedAt && !wasAlreadyComplete) {
      await this.creditCompletionAndNotify(userId, course);
    }

    return { lastSlideIndex: progress.lastSlideIndex, completedAt: progress.completedAt };
  }

  /**
   * Best-effort: a reward/email failure must never make saveProgress itself
   * fail and re-block the trainer's already-recorded completion, so both
   * steps are individually caught and logged rather than left to bubble.
   */
  private async creditCompletionAndNotify(
    userId: string,
    course: { id: string; title: string; completionRewardTokens: Prisma.Decimal | null },
  ) {
    const hasReward = course.completionRewardTokens != null && course.completionRewardTokens.gt(0);
    let rewardTokens: string | null = null;

    if (hasReward) {
      try {
        const credited = await creditCourseCompletionReward(this.prisma, userId, course.id, course.completionRewardTokens!);
        if (credited) rewardTokens = course.completionRewardTokens!.toString();
      } catch {
        // Reward credit failure shouldn't block the completion email below,
        // or the saveProgress response itself -- admin can see/fix via the
        // ledger; the trainer's completion is already recorded regardless.
      }
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user) {
        await this.mail.sendCourseCompletedEmail({ trainerEmail: user.email, courseTitle: course.title, rewardTokens });
      }
    } catch {
      // Best-effort, same as every other post-completion side effect here.
    }
  }

  listAdmin() {
    return this.prisma.course.findMany({
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      include: { author: { select: authorSelect } },
    });
  }

  async getAdmin(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { author: { select: authorSelect } },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async create(authorId: string, dto: CreateCourseDto) {
    const document = validateCourseDocument(dto.content);
    const id = randomUUID();
    const title = dto.title.trim();
    const lastCourse = await this.prisma.course.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const status = dto.status ?? BlogPostStatus.DRAFT;

    const course = await this.prisma.course.create({
      data: {
        id,
        title,
        slug: slugFor(title, id),
        summary: dto.summary.trim(),
        slides: document as unknown as Prisma.InputJsonValue,
        coverImageUrl: cleanOptional(dto.coverImageUrl),
        coverImageKey: cleanOptional(dto.coverImageKey),
        coverImageAlt: cleanOptional(dto.coverImageAlt),
        status,
        visibility: dto.visibility ?? CourseVisibility.PRIVATE,
        required: dto.required ?? false,
        completionRewardTokens: dto.completionRewardTokens ?? null,
        sortOrder: (lastCourse?.sortOrder ?? -1) + 1,
        authorId,
        publishedAt: status === BlogPostStatus.PUBLISHED ? new Date() : null,
      },
      include: { author: { select: authorSelect } },
    });
    if (status === BlogPostStatus.PUBLISHED) {
      await this.notifications.notifyCoursePublished(authorId, course);
    }
    return course;
  }

  async update(id: string, dto: UpdateCourseDto) {
    const current = await this.getAdmin(id);
    const title = dto.title !== undefined ? dto.title.trim() : undefined;
    const document = dto.content ? validateCourseDocument(dto.content) : undefined;
    const nextStatus = dto.status ?? current.status;
    const slideCount = document
      ? document.slides.length
      : (current.slides as unknown as CourseDocument).slides.length;
    if (nextStatus === BlogPostStatus.PUBLISHED && slideCount === 0) {
      throw new BadRequestException('Published courses require at least one slide');
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        ...(title !== undefined && { title, slug: slugFor(title, id) }),
        ...(dto.summary !== undefined && { summary: dto.summary.trim() }),
        ...(document && { slides: document as unknown as Prisma.InputJsonValue }),
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: cleanOptional(dto.coverImageUrl) }),
        ...(dto.coverImageKey !== undefined && { coverImageKey: cleanOptional(dto.coverImageKey) }),
        ...(dto.coverImageAlt !== undefined && { coverImageAlt: cleanOptional(dto.coverImageAlt) }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.completionRewardTokens !== undefined && { completionRewardTokens: dto.completionRewardTokens ?? null }),
        ...(dto.status !== undefined && {
          status: dto.status,
          publishedAt: nextStatus === BlogPostStatus.PUBLISHED ? current.publishedAt ?? new Date() : null,
        }),
      },
      include: { author: { select: authorSelect } },
    });
    if (current.status !== BlogPostStatus.PUBLISHED && nextStatus === BlogPostStatus.PUBLISHED) {
      await this.notifications.notifyCoursePublished(current.authorId, course);
    }
    return course;
  }

  async reorder(dto: ReorderCoursesDto) {
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate course ids are not allowed');
    const count = await this.prisma.course.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('One or more courses do not exist');
    await this.prisma.$transaction(dto.items.map((item) => this.prisma.course.update({
      where: { id: item.id },
      data: { sortOrder: item.sortOrder },
    })));
    return { reordered: ids.length };
  }

  async remove(id: string) {
    await this.getAdmin(id);
    await this.prisma.course.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Compliance gate: every PUBLISHED course with required=true that this
   * trainer hasn't completed yet (no CourseProgress row, or one with
   * completedAt: null). Called from both WordsService.startSession and
   * SubmissionsController.create before any task is handed out or accepted
   * -- a trainer who becomes non-compliant mid-session (admin marks a new
   * course required while they're already training) is still blocked on
   * their *next* task, since this re-checks on every call rather than once
   * per session. Ordered by createdAt so the oldest still-outstanding
   * requirement surfaces first, matching how it was likely assigned.
   */
  async getIncompleteRequiredCourses(userId: string) {
    const required = await this.prisma.course.findMany({
      where: { status: BlogPostStatus.PUBLISHED, required: true },
      select: { id: true, slug: true, title: true },
      orderBy: { createdAt: 'asc' },
    });
    if (required.length === 0) return [];

    const completedRows = await this.prisma.courseProgress.findMany({
      where: { userId, courseId: { in: required.map((c) => c.id) }, completedAt: { not: null } },
      select: { courseId: true },
    });
    const completedIds = new Set(completedRows.map((row) => row.courseId));

    return required.filter((course) => !completedIds.has(course.id));
  }
}

function cleanOptional(value?: string): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}
