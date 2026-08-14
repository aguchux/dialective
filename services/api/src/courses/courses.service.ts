import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BlogPostStatus, Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async listPublished() {
    return this.prisma.course.findMany({
      where: { status: BlogPostStatus.PUBLISHED },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
      select: {
        id: true, slug: true, title: true, summary: true,
        coverImageUrl: true, coverImageAlt: true, publishedAt: true,
        createdAt: true, updatedAt: true,
      },
    });
  }

  async getPublishedPreview(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: {
        id: true, slug: true, title: true, summary: true,
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

  async saveProgress(userId: string, slug: string, lastSlideIndex: number, totalSlides: number) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');

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

    return { lastSlideIndex: progress.lastSlideIndex, completedAt: progress.completedAt };
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

    return this.prisma.course.create({
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
        sortOrder: (lastCourse?.sortOrder ?? -1) + 1,
        authorId,
        publishedAt: status === BlogPostStatus.PUBLISHED ? new Date() : null,
      },
      include: { author: { select: authorSelect } },
    });
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

    return this.prisma.course.update({
      where: { id },
      data: {
        ...(title !== undefined && { title, slug: slugFor(title, id) }),
        ...(dto.summary !== undefined && { summary: dto.summary.trim() }),
        ...(document && { slides: document as unknown as Prisma.InputJsonValue }),
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: cleanOptional(dto.coverImageUrl) }),
        ...(dto.coverImageKey !== undefined && { coverImageKey: cleanOptional(dto.coverImageKey) }),
        ...(dto.coverImageAlt !== undefined && { coverImageAlt: cleanOptional(dto.coverImageAlt) }),
        ...(dto.status !== undefined && {
          status: dto.status,
          publishedAt: nextStatus === BlogPostStatus.PUBLISHED ? current.publishedAt ?? new Date() : null,
        }),
      },
      include: { author: { select: authorSelect } },
    });
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
}

function cleanOptional(value?: string): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}
