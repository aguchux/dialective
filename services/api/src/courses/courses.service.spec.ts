import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { CoursesService } from './courses.service';

describe('CoursesService', () => {
  let prisma: any;
  let mail: any;
  let service: CoursesService;

  beforeEach(() => {
    prisma = {
      course: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      courseProgress: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ email: 'trainer@example.com' }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(),
    };
    mail = { sendCourseCompletedEmail: jest.fn().mockResolvedValue(undefined) };
    service = new CoursesService(prisma, { notifyCoursePublished: jest.fn() } as any, mail as any);
  });

  describe('listAdmin', () => {
    it('attaches completed/total trainer counts per course from a single groupBy, not N+1 queries', async () => {
      prisma.course.findMany.mockResolvedValue([
        { id: 'course-1', title: 'Safety' },
        { id: 'course-2', title: 'Optional' },
      ]);
      prisma.user.count.mockResolvedValue(10);
      prisma.courseProgress.groupBy.mockResolvedValue([
        { courseId: 'course-1', _count: { _all: 6 } },
      ]);

      const result = await service.listAdmin();

      expect(result).toEqual([
        { id: 'course-1', title: 'Safety', completedTrainerCount: 6, totalTrainerCount: 10 },
        { id: 'course-2', title: 'Optional', completedTrainerCount: 0, totalTrainerCount: 10 },
      ]);
      expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: 'TRAINER' } });
      expect(prisma.courseProgress.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['courseId'], where: { completedAt: { not: null } } }),
      );
    });
  });

  describe('getPublishedPreview', () => {
    it('strips slides and returns a slideCount', async () => {
      prisma.course.findFirst.mockResolvedValue({
        id: 'c1',
        slug: 'intro',
        title: 'Intro',
        summary: 'sum',
        coverImageUrl: null,
        coverImageAlt: null,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        slides: { slides: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
      });
      const result = await service.getPublishedPreview('intro');
      expect(result.slideCount).toBe(3);
      expect((result as Record<string, unknown>).slides).toBeUndefined();
    });

    it('404s when the course is missing or not published', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      await expect(service.getPublishedPreview('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getForStudy', () => {
    it("returns full slides plus the caller's own progress", async () => {
      prisma.course.findFirst.mockResolvedValue({
        id: 'c1',
        slug: 'intro',
        title: 'Intro',
        summary: 'sum',
        coverImageUrl: null,
        coverImageAlt: null,
        slides: { slides: [{ text: 'a' }, { text: 'b' }] },
      });
      prisma.courseProgress.findUnique.mockResolvedValue({
        lastSlideIndex: 1,
        maxSlideIndexReached: 1,
        completedAt: null,
      });

      const result = await service.getForStudy('user-1', 'intro');
      expect(result.slides).toEqual([{ text: 'a' }, { text: 'b' }]);
      expect(result.progress).toEqual({
        lastSlideIndex: 1,
        maxSlideIndexReached: 1,
        completedAt: null,
      });
    });

    it('404s on a draft or nonexistent slug -- same as "does not exist" to a non-admin caller', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      await expect(service.getForStudy('user-1', 'draft-course')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPublicForStudy', () => {
    it('returns full slides with no progress field, filtered to PUBLISHED+PUBLIC', async () => {
      prisma.course.findFirst.mockResolvedValue({
        id: 'c1',
        slug: 'how-it-works',
        title: 'How It Works',
        summary: 'sum',
        coverImageUrl: null,
        coverImageAlt: null,
        slides: { slides: [{ text: 'a' }, { text: 'b' }] },
      });

      const result = await service.getPublicForStudy('how-it-works');

      expect(prisma.course.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            slug: 'how-it-works',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          }),
        }),
      );
      expect(result.slides).toEqual([{ text: 'a' }, { text: 'b' }]);
      expect((result as Record<string, unknown>).progress).toBeUndefined();
    });

    it('404s on a PRIVATE course -- never reachable without login', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      await expect(service.getPublicForStudy('private-course')).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveProgress', () => {
    // 5-slide course (indices 0..4) is the shared fixture below.
    const fiveSlideCourse = {
      id: 'c1',
      title: 'Intro',
      completionRewardTokens: null as any,
      slides: {
        slides: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }],
      },
    };

    it('rejects a lastSlideIndex that jumps ahead of the next unseen slide, instead of silently clamping to the end', async () => {
      prisma.course.findFirst.mockResolvedValue(fiveSlideCourse);
      prisma.courseProgress.findUnique.mockResolvedValue(null); // no prior progress -> priorMax 0

      // Client claims index 4 (the last slide) having never reported 1, 2, 3
      // -- this is exactly the spoof this enforcement exists to block.
      await expect(service.saveProgress('user-1', 'intro', 4, 5)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.courseProgress.upsert).not.toHaveBeenCalled();
    });

    it('accepts advancing exactly one slide past the prior high-water mark', async () => {
      prisma.course.findFirst.mockResolvedValue(fiveSlideCourse);
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: null,
        maxSlideIndexReached: 1,
      });
      prisma.courseProgress.upsert.mockImplementation(({ update }: any) =>
        Promise.resolve({
          lastSlideIndex: update.lastSlideIndex,
          maxSlideIndexReached: update.maxSlideIndexReached,
          completedAt: update.completedAt ?? null,
        }),
      );

      const result = await service.saveProgress('user-1', 'intro', 2, 5);
      expect(result.maxSlideIndexReached).toBe(2);
      expect(result.completedAt).toBeNull();
    });

    it('allows moving backward to review an earlier slide without losing the high-water mark', async () => {
      prisma.course.findFirst.mockResolvedValue(fiveSlideCourse);
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: null,
        maxSlideIndexReached: 3,
      });
      prisma.courseProgress.upsert.mockImplementation(({ update }: any) =>
        Promise.resolve({
          lastSlideIndex: update.lastSlideIndex,
          maxSlideIndexReached: update.maxSlideIndexReached,
          completedAt: update.completedAt ?? null,
        }),
      );

      const result = await service.saveProgress('user-1', 'intro', 0, 5);
      expect(result.lastSlideIndex).toBe(0);
      // High-water mark stays at 3 -- paging back doesn't erase progress.
      expect(result.maxSlideIndexReached).toBe(3);
    });

    it('sets completedAt only once the high-water mark reaches the true final slide (derived from course.slides, not client totalSlides)', async () => {
      prisma.course.findFirst.mockResolvedValue(fiveSlideCourse);
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: null,
        maxSlideIndexReached: 3,
      });
      prisma.courseProgress.upsert.mockImplementation(({ update }: any) =>
        Promise.resolve({
          lastSlideIndex: update.lastSlideIndex,
          maxSlideIndexReached: update.maxSlideIndexReached,
          completedAt: update.completedAt ?? null,
        }),
      );

      // Client lies about totalSlides=2 (trying to make index 4 look
      // in-bounds/final early) -- server still uses the real 5-slide count.
      const result = await service.saveProgress('user-1', 'intro', 4, 2);
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('never clears an existing completedAt on a later, earlier-index save', async () => {
      prisma.course.findFirst.mockResolvedValue(fiveSlideCourse);
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: new Date('2026-01-01'),
        maxSlideIndexReached: 4,
      });
      prisma.courseProgress.upsert.mockImplementation(({ update }: any) =>
        Promise.resolve({
          lastSlideIndex: update.lastSlideIndex,
          maxSlideIndexReached: update.maxSlideIndexReached,
          completedAt: update.completedAt ?? 'unchanged',
        }),
      );

      await service.saveProgress('user-1', 'intro', 0, 5);
      const call = prisma.courseProgress.upsert.mock.calls[0][0];
      expect(call.update.completedAt).toEqual(new Date('2026-01-01'));
    });

    it('does not re-credit or re-email on a save that keeps an already-completed course completed', async () => {
      prisma.course.findFirst.mockResolvedValue({
        ...fiveSlideCourse,
        completionRewardTokens: new Prisma.Decimal(5),
      });
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: new Date('2026-01-01'),
        maxSlideIndexReached: 4,
      });
      prisma.courseProgress.upsert.mockResolvedValue({
        lastSlideIndex: 4,
        maxSlideIndexReached: 4,
        completedAt: new Date('2026-01-01'),
      });
      prisma.ledgerEntry = { create: jest.fn() };
      prisma.wallet = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };

      await service.saveProgress('user-1', 'intro', 4, 5);
      expect(mail.sendCourseCompletedEmail).not.toHaveBeenCalled();
      // The actual reward-integrity guarantee: retaking an already-completed
      // course must never touch the ledger/wallet a second time, not just
      // skip the email.
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not re-credit across repeated retakes -- same course, several completed re-saves in a row', async () => {
      prisma.course.findFirst.mockResolvedValue({
        ...fiveSlideCourse,
        completionRewardTokens: new Prisma.Decimal(5),
      });
      // Every re-save after the first sees the course already completed --
      // simulates a trainer re-opening and re-finishing the same course
      // multiple times.
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: new Date('2026-01-01'),
        maxSlideIndexReached: 4,
      });
      prisma.courseProgress.upsert.mockResolvedValue({
        lastSlideIndex: 4,
        maxSlideIndexReached: 4,
        completedAt: new Date('2026-01-01'),
      });
      prisma.ledgerEntry = { create: jest.fn() };
      prisma.wallet = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };

      await service.saveProgress('user-1', 'intro', 4, 5);
      await service.saveProgress('user-1', 'intro', 4, 5);
      await service.saveProgress('user-1', 'intro', 4, 5);

      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
      expect(mail.sendCourseCompletedEmail).not.toHaveBeenCalled();
    });

    it('credits the completion reward and emails once, the first time a course is completed by walking every slide in order', async () => {
      const completionRewardTokens = new Prisma.Decimal(5);
      prisma.course.findFirst.mockResolvedValue({ ...fiveSlideCourse, completionRewardTokens });
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: null,
        maxSlideIndexReached: 3,
      });
      prisma.courseProgress.upsert.mockResolvedValue({
        lastSlideIndex: 4,
        maxSlideIndexReached: 4,
        completedAt: new Date(),
      });
      prisma.ledgerEntry = { create: jest.fn().mockResolvedValue({}) };
      prisma.wallet = {
        findUnique: jest.fn().mockResolvedValue({ id: 'w1' }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      };
      prisma.$transaction.mockImplementation((fn: any) => fn(prisma));

      await service.saveProgress('user-1', 'intro', 4, 5);

      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'COURSE_COMPLETION_REWARD', reference: 'c1' }),
        }),
      );
      // No completion email: this was the platform's largest email source
      // (7,693/week) for a message about something the trainer had just
      // done themselves. The reward crediting above is the behaviour that
      // actually matters, and it is unchanged.
      expect(mail.sendCourseCompletedEmail).not.toHaveBeenCalled();
    });

    it('completes a reward-less course without emailing', async () => {
      prisma.course.findFirst.mockResolvedValue({
        ...fiveSlideCourse,
        completionRewardTokens: null,
      });
      prisma.courseProgress.findUnique.mockResolvedValue({
        completedAt: null,
        maxSlideIndexReached: 3,
      });
      prisma.courseProgress.upsert.mockResolvedValue({
        lastSlideIndex: 4,
        maxSlideIndexReached: 4,
        completedAt: new Date(),
      });

      await service.saveProgress('user-1', 'intro', 4, 5);

      expect(prisma.courseProgress.upsert).toHaveBeenCalled();
      expect(mail.sendCourseCompletedEmail).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rejects an invalid slide document before touching the database', async () => {
      await expect(
        service.create('author-1', {
          title: 'My Course',
          summary: 'sum',
          content: { slides: [] },
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.course.create).not.toHaveBeenCalled();
    });

    it('creates a course with a slug derived from the title', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      prisma.course.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const result = await service.create('author-1', {
        title: 'Getting Started',
        summary: 'sum',
        content: { slides: [{ text: { blocks: [{ type: 'paragraph', data: { text: 'hi' } }] } }] },
      } as any);
      expect(result.slug).toMatch(/^getting-started-/);
      expect(result.sortOrder).toBe(0);
    });
  });

  describe('update', () => {
    it('rejects publishing a course with zero slides', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'DRAFT',
        slides: { slides: [] },
        author: {},
      });
      await expect(service.update('c1', { status: 'PUBLISHED' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reorder', () => {
    it('rejects duplicate ids', async () => {
      await expect(
        service.reorder({
          items: [
            { id: 'a', sortOrder: 0 },
            { id: 'a', sortOrder: 1 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when an id does not exist', async () => {
      prisma.course.count.mockResolvedValue(1);
      await expect(
        service.reorder({
          items: [
            { id: 'a', sortOrder: 0 },
            { id: 'b', sortOrder: 1 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getIncompleteRequiredCourses', () => {
    it('returns [] with no extra queries when no course is required', async () => {
      prisma.course.findMany.mockResolvedValue([]);
      const result = await service.getIncompleteRequiredCourses('user-1');
      expect(result).toEqual([]);
      expect(prisma.courseProgress.findMany).not.toHaveBeenCalled();
    });

    it('excludes courses this trainer has already completed', async () => {
      prisma.course.findMany.mockResolvedValue([
        { id: 'c1', slug: 'intro', title: 'Intro' },
        { id: 'c2', slug: 'safety', title: 'Safety' },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([{ courseId: 'c1' }]);

      const result = await service.getIncompleteRequiredCourses('user-1');
      expect(result).toEqual([{ id: 'c2', slug: 'safety', title: 'Safety' }]);
    });
  });
});
