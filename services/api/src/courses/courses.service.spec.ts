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
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'trainer@example.com', createdAt: new Date('2020-01-01') }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ createdAt: new Date('2020-01-01') }),
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

    /**
     * The bug this guards: marking a fourth course required in September
     * retrospectively blocked 1,628 trainers who had completed every
     * requirement that existed when they signed up. From their side, a
     * platform they were compliant with started demanding training again.
     */
    it('does not block a trainer who signed up before the course became required', async () => {
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date('2026-08-01') });
      prisma.course.findMany.mockResolvedValue([
        { id: 'c1', slug: 'intro', title: 'Intro', requiredSince: new Date('2026-07-01') },
        { id: 'c2', slug: 'p2p', title: 'P2P', requiredSince: new Date('2026-09-16') },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([{ courseId: 'c1' }]);

      const result = await service.getIncompleteRequiredCourses('user-1');
      expect(result).toEqual([]);
    });

    it('still blocks a trainer who signed up after the course became required', async () => {
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date('2026-09-20') });
      prisma.course.findMany.mockResolvedValue([
        { id: 'c2', slug: 'p2p', title: 'P2P', requiredSince: new Date('2026-09-16') },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([]);

      const result = await service.getIncompleteRequiredCourses('user-1');
      expect(result).toEqual([{ id: 'c2', slug: 'p2p', title: 'P2P' }]);
    });

    it('blocks a trainer who signed up at the exact moment it became required', async () => {
      const at = new Date('2026-09-16T00:00:00Z');
      prisma.user.findUnique.mockResolvedValue({ createdAt: at });
      prisma.course.findMany.mockResolvedValue([
        { id: 'c2', slug: 'p2p', title: 'P2P', requiredSince: at },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([]);

      const result = await service.getIncompleteRequiredCourses('user-1');
      expect(result).toHaveLength(1);
    });

    /**
     * Only reachable for rows written before the requiredSince column
     * existed; the migration backfills every currently-required course, but
     * the fallback must stay blocking rather than silently exempting
     * everyone if one is ever missed.
     */
    it('treats a null requiredSince as applying to everyone', async () => {
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date('2020-01-01') });
      prisma.course.findMany.mockResolvedValue([
        { id: 'c1', slug: 'legacy', title: 'Legacy', requiredSince: null },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([]);

      const result = await service.getIncompleteRequiredCourses('user-1');
      expect(result).toEqual([{ id: 'c1', slug: 'legacy', title: 'Legacy' }]);
    });
  });

  describe('grandfathered suggestions', () => {
    it('suggests a course the trainer is grandfathered out of', async () => {
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date('2026-08-01') });
      prisma.course.findMany.mockResolvedValue([
        {
          id: 'c2',
          slug: 'p2p',
          title: 'P2P',
          summary: 'How P2P works',
          requiredSince: new Date('2026-09-16'),
        },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([]);

      const result = await service.getSuggestedCourses('user-1');
      expect(result).toEqual([{ id: 'c2', slug: 'p2p', title: 'P2P', summary: 'How P2P works' }]);
    });

    it('does not suggest a course that actually gates this trainer', async () => {
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date('2026-09-20') });
      prisma.course.findMany.mockResolvedValue([
        { id: 'c2', slug: 'p2p', title: 'P2P', summary: '', requiredSince: new Date('2026-09-16') },
      ]);

      expect(await service.getSuggestedCourses('user-1')).toEqual([]);
    });

    it('does not suggest a course already completed or dismissed', async () => {
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date('2026-08-01') });
      prisma.course.findMany.mockResolvedValue([
        { id: 'c2', slug: 'p2p', title: 'P2P', summary: '', requiredSince: new Date('2026-09-16') },
      ]);
      prisma.courseProgress.findMany.mockResolvedValue([{ courseId: 'c2' }]);

      expect(await service.getSuggestedCourses('user-1')).toEqual([]);
    });

    /**
     * The dismissal route must never become a way around a requirement, so
     * it re-runs the same grandfathering comparison the gate makes rather
     * than trusting that the client only offers dismiss on a suggestion.
     */
    it('refuses to dismiss a course that is genuinely required for this trainer', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ createdAt: new Date('2026-09-20') });
      prisma.course.findFirst.mockResolvedValue({
        id: 'c2',
        required: true,
        requiredSince: new Date('2026-09-16'),
      });

      await expect(service.dismissSuggestion('user-1', 'p2p')).rejects.toThrow(BadRequestException);
      expect(prisma.courseProgress.upsert).not.toHaveBeenCalled();
    });

    it('records a dismissal for a grandfathered trainer', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ createdAt: new Date('2026-08-01') });
      prisma.course.findFirst.mockResolvedValue({
        id: 'c2',
        required: true,
        requiredSince: new Date('2026-09-16'),
      });

      await service.dismissSuggestion('user-1', 'p2p');
      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_courseId: { userId: 'user-1', courseId: 'c2' } },
        }),
      );
    });
  });

  describe('requiredSince stamping', () => {
    /**
     * Restamping on an ordinary edit would reset the grandfathering line
     * and retrospectively block everyone who joined before it -- the exact
     * bug this column exists to prevent.
     */
    it('does not move requiredSince when re-saving an already-required course', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'PUBLISHED',
        required: true,
        publishedAt: new Date('2026-09-16'),
        authorId: 'admin-1',
        slides: { slides: [{}] },
      });
      prisma.course.update.mockResolvedValue({ id: 'c1' });

      await service.update('c1', { required: true, summary: 'typo fixed' } as any);

      const data = prisma.course.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('requiredSince');
    });

    it('stamps requiredSince when a course first becomes required', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'PUBLISHED',
        required: false,
        publishedAt: new Date('2026-09-16'),
        authorId: 'admin-1',
        slides: { slides: [{}] },
      });
      prisma.course.update.mockResolvedValue({ id: 'c1' });

      await service.update('c1', { required: true } as any);

      const data = prisma.course.update.mock.calls[0][0].data;
      expect(data.required).toBe(true);
      expect(data.requiredSince).toBeInstanceOf(Date);
    });

    it('clears requiredSince when a course stops being required', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'PUBLISHED',
        required: true,
        publishedAt: new Date('2026-09-16'),
        authorId: 'admin-1',
        slides: { slides: [{}] },
      });
      prisma.course.update.mockResolvedValue({ id: 'c1' });

      await service.update('c1', { required: false } as any);

      const data = prisma.course.update.mock.calls[0][0].data;
      expect(data.required).toBe(false);
      expect(data.requiredSince).toBeNull();
    });

  });
});
