import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BlogPostStatus,
  CourseVisibility,
  creditCourseCompletionReward,
  Prisma,
} from '@dialectiva/db';
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
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);
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
        id: true,
        slug: true,
        title: true,
        summary: true,
        visibility: true,
        coverImageUrl: true,
        coverImageAlt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPublishedPreview(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        visibility: true,
        coverImageUrl: true,
        coverImageAlt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        slides: true,
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
      progress: progress
        ? {
            lastSlideIndex: progress.lastSlideIndex,
            maxSlideIndexReached: progress.maxSlideIndexReached,
            completedAt: progress.completedAt,
          }
        : null,
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

  /**
   * Strict enforcement: totalSlides is derived from the course record
   * itself, never trusted from the client, so a spoofed totalSlides can't
   * shrink the finish line. lastSlideIndex is the client's requested resume
   * point and may move freely backward (the trainer paging back to review
   * an earlier slide) or forward by exactly one slide past their prior
   * high-water mark -- any larger forward jump is rejected outright rather
   * than silently clamped, since silently accepting it would let a client
   * skip straight to the end. maxSlideIndexReached is the actual completion
   * signal: it only ever advances one index at a time, so it can only reach
   * the final slide by the client having reported every index in between,
   * i.e. by the trainer having actually opened every slide in order.
   */
  async saveProgress(userId: string, slug: string, lastSlideIndex: number, totalSlides: number) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: { id: true, title: true, completionRewardTokens: true, slides: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    const actualTotalSlides = Math.max(
      1,
      (course.slides as unknown as CourseDocument).slides.length,
    );
    const lastIndex = actualTotalSlides - 1;

    const existingProgress = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { completedAt: true, maxSlideIndexReached: true },
    });
    const wasAlreadyComplete = existingProgress?.completedAt != null;
    const priorMax = existingProgress?.maxSlideIndexReached ?? 0;

    const requestedIndex = Math.min(Math.max(0, lastSlideIndex), lastIndex);
    if (requestedIndex > priorMax + 1) {
      throw new BadRequestException(
        'Slides must be viewed in order -- cannot skip ahead of the next unseen slide',
      );
    }

    const newMax = Math.max(priorMax, requestedIndex);
    const completedAt = wasAlreadyComplete
      ? existingProgress!.completedAt
      : newMax >= lastIndex
        ? new Date()
        : null;

    const progress = await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      create: {
        userId,
        courseId: course.id,
        lastSlideIndex: requestedIndex,
        maxSlideIndexReached: newMax,
        completedAt,
      },
      update: {
        lastSlideIndex: requestedIndex,
        maxSlideIndexReached: newMax,
        // Once completed, never cleared -- a later re-save (even one that
        // revisits an earlier slide) must not un-complete the course.
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

    return {
      lastSlideIndex: progress.lastSlideIndex,
      maxSlideIndexReached: progress.maxSlideIndexReached,
      completedAt: progress.completedAt,
    };
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
        const credited = await creditCourseCompletionReward(
          this.prisma,
          userId,
          course.id,
          course.completionRewardTokens!,
        );
        if (credited) rewardTokens = course.completionRewardTokens!.toString();
      } catch {
        // Reward credit failure shouldn't block the completion email below,
        // or the saveProgress response itself -- admin can see/fix via the
        // ledger; the trainer's completion is already recorded regardless.
      }
    }

    // No course-completion email. This was the platform's single largest
    // email source -- 7,693 sends in one week, more than every OTP
    // combined -- for a congratulatory message about something the trainer
    // had just done themselves and could already see in the UI. The reward
    // still lands in their wallet and still shows in their ledger.
  }

  async listAdmin() {
    const [courses, totalTrainers, completions] = await Promise.all([
      this.prisma.course.findMany({
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        include: { author: { select: authorSelect } },
      }),
      this.prisma.user.count({ where: { role: 'TRAINER' } }),
      // One row per (userId, courseId) thanks to CourseProgress's unique
      // constraint, so counting completedAt-not-null rows per courseId is
      // an exact per-trainer completion count, not an over-count from
      // multiple saves of the same course.
      this.prisma.courseProgress.groupBy({
        by: ['courseId'],
        where: { completedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const completedByCourseId = new Map(completions.map((row) => [row.courseId, row._count._all]));
    return courses.map((course) => ({
      ...course,
      completedTrainerCount: completedByCourseId.get(course.id) ?? 0,
      totalTrainerCount: totalTrainers,
    }));
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
    const lastCourse = await this.prisma.course.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
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
        // Stamped on the transition into required so the gate knows which
        // trainers this can apply to -- see getIncompleteRequiredCourses.
        requiredSince: dto.required ? new Date() : null,
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
        // requiredSince moves only on a real transition. Re-saving a course
        // that is already required must NOT restamp it -- that would reset
        // the grandfathering line and retrospectively block every trainer
        // who joined before the edit, which is the exact bug this column
        // exists to prevent. An admin editing a typo is not changing who
        // the course applies to.
        ...(dto.required !== undefined &&
          dto.required !== current.required && {
            required: dto.required,
            requiredSince: dto.required ? new Date() : null,
          }),
        ...(dto.completionRewardTokens !== undefined && {
          completionRewardTokens: dto.completionRewardTokens ?? null,
        }),
        ...(dto.status !== undefined && {
          status: dto.status,
          publishedAt:
            nextStatus === BlogPostStatus.PUBLISHED ? (current.publishedAt ?? new Date()) : null,
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
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate course ids are not allowed');
    const count = await this.prisma.course.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('One or more courses do not exist');
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.course.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
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
   * completedAt: null). Called from WordsService.startSession/
   * nextAssignment before any task is handed out or accepted -- a trainer
   * who becomes non-compliant mid-session (admin marks a new course
   * required while they're already training) is still blocked on their
   * *next* task, since this re-checks on every call rather than once per
   * session. Ordered by createdAt so the oldest still-outstanding
   * requirement surfaces first, matching how it was likely assigned.
   */
  async getIncompleteRequiredCourses(userId: string) {
    const [user, required] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.course.findMany({
        where: { status: BlogPostStatus.PUBLISHED, required: true },
        select: { id: true, slug: true, title: true, requiredSince: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (required.length === 0) return [];

    const completedRows = await this.prisma.courseProgress.findMany({
      where: { userId, courseId: { in: required.map((c) => c.id) }, completedAt: { not: null } },
      select: { courseId: true },
    });
    const completedIds = new Set(completedRows.map((row) => row.courseId));

    return required
      .filter((course) => !completedIds.has(course.id))
      // Grandfathering. A course only gates a trainer who signed up at or
      // after it became required. Marking a new course required must not
      // reach back and block trainers who had already satisfied every
      // requirement that existed when they joined -- they did nothing, and
      // from their side the platform just starts demanding training again
      // with no explanation. A null requiredSince keeps the old
      // applies-to-everyone reading, which the migration backfills away so
      // only a row written before this column can hit it.
      .filter(
        (course) =>
          !course.requiredSince ||
          !user ||
          user.createdAt.getTime() >= course.requiredSince.getTime(),
      )
      .map(({ id, slug, title }) => ({ id, slug, title }));
  }

  /**
   * Required courses this trainer is grandfathered out of and has not yet
   * completed or dismissed -- suggested reading, never a gate.
   *
   * Deliberately a separate method from getIncompleteRequiredCourses rather
   * than a flag on its rows: that one feeds the 403 that blocks training,
   * and a caller that forgot to filter by a `blocking: false` flag would
   * turn a suggestion into a block. These cannot be confused because they
   * never travel together.
   */
  async getSuggestedCourses(userId: string) {
    const [user, required] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.course.findMany({
        where: { status: BlogPostStatus.PUBLISHED, required: true, requiredSince: { not: null } },
        select: { id: true, slug: true, title: true, summary: true, requiredSince: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!user || required.length === 0) return [];

    const grandfathered = required.filter(
      (course) => user.createdAt.getTime() < course.requiredSince!.getTime(),
    );
    if (grandfathered.length === 0) return [];

    // One query covers both exclusions: a course already completed needs no
    // suggestion, and a dismissed one was explicitly waved away.
    const handled = await this.prisma.courseProgress.findMany({
      where: {
        userId,
        courseId: { in: grandfathered.map((c) => c.id) },
        OR: [{ completedAt: { not: null } }, { suggestionDismissedAt: { not: null } }],
      },
      select: { courseId: true },
    });
    const handledIds = new Set(handled.map((row) => row.courseId));

    return grandfathered
      .filter((course) => !handledIds.has(course.id))
      .map(({ id, slug, title, summary }) => ({ id, slug, title, summary }));
  }

  /**
   * Dismisses a suggested course for this trainer.
   *
   * Refuses a course that actually gates them, so this can never be used to
   * skip a requirement -- the check is the same grandfathering comparison
   * the gate itself makes, not a trusted client assertion.
   */
  async dismissSuggestion(userId: string, slug: string) {
    const [user, course] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.course.findFirst({
        where: { slug, status: BlogPostStatus.PUBLISHED },
        select: { id: true, required: true, requiredSince: true },
      }),
    ]);
    if (!course) throw new NotFoundException('Course not found');

    const gatesThisTrainer =
      course.required &&
      (!course.requiredSince || user.createdAt.getTime() >= course.requiredSince.getTime());
    if (gatesThisTrainer) {
      throw new BadRequestException('This course is required for you and cannot be dismissed');
    }

    await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      create: { userId, courseId: course.id, suggestionDismissedAt: new Date() },
      update: { suggestionDismissedAt: new Date() },
    });
    return { dismissed: true };
  }
}

function cleanOptional(value?: string): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}
