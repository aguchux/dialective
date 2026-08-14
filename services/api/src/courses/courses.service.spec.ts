import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';

describe('CoursesService', () => {
  let prisma: any;
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
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new CoursesService(prisma);
  });

  describe('getPublishedPreview', () => {
    it('strips slides and returns a slideCount', async () => {
      prisma.course.findFirst.mockResolvedValue({
        id: 'c1', slug: 'intro', title: 'Intro', summary: 'sum',
        coverImageUrl: null, coverImageAlt: null, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
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
    it('returns full slides plus the caller\'s own progress', async () => {
      prisma.course.findFirst.mockResolvedValue({
        id: 'c1', slug: 'intro', title: 'Intro', summary: 'sum',
        coverImageUrl: null, coverImageAlt: null,
        slides: { slides: [{ text: 'a' }, { text: 'b' }] },
      });
      prisma.courseProgress.findUnique.mockResolvedValue({ lastSlideIndex: 1, completedAt: null });

      const result = await service.getForStudy('user-1', 'intro');
      expect(result.slides).toEqual([{ text: 'a' }, { text: 'b' }]);
      expect(result.progress).toEqual({ lastSlideIndex: 1, completedAt: null });
    });

    it('404s on a draft or nonexistent slug -- same as "does not exist" to a non-admin caller', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      await expect(service.getForStudy('user-1', 'draft-course')).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveProgress', () => {
    it('clamps lastSlideIndex into bounds and sets completedAt on the final slide', async () => {
      prisma.course.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.courseProgress.upsert.mockImplementation(({ create }: any) => Promise.resolve(create));

      const result = await service.saveProgress('user-1', 'intro', 99, 5);
      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ lastSlideIndex: 4, completedAt: expect.any(Date) }),
      }));
      expect(result.lastSlideIndex).toBe(4);
    });

    it('does not set completedAt when not yet on the final slide', async () => {
      prisma.course.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.courseProgress.upsert.mockImplementation(({ create }: any) => Promise.resolve(create));

      await service.saveProgress('user-1', 'intro', 1, 5);
      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ lastSlideIndex: 1, completedAt: null }),
      }));
    });

    it('never clears an existing completedAt on a later, earlier-index save', async () => {
      prisma.course.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.courseProgress.upsert.mockImplementation(({ update }: any) => Promise.resolve({ lastSlideIndex: update.lastSlideIndex, completedAt: update.completedAt ?? 'unchanged' }));

      await service.saveProgress('user-1', 'intro', 0, 5);
      const call = prisma.courseProgress.upsert.mock.calls[0][0];
      expect(call.update).not.toHaveProperty('completedAt');
    });
  });

  describe('create', () => {
    it('rejects an invalid slide document before touching the database', async () => {
      await expect(service.create('author-1', {
        title: 'My Course', summary: 'sum', content: { slides: [] },
      } as any)).rejects.toThrow(BadRequestException);
      expect(prisma.course.create).not.toHaveBeenCalled();
    });

    it('creates a course with a slug derived from the title', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      prisma.course.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const result = await service.create('author-1', {
        title: 'Getting Started', summary: 'sum', content: { slides: [{ text: { blocks: [{ type: 'paragraph', data: { text: 'hi' } }] } }] },
      } as any);
      expect(result.slug).toMatch(/^getting-started-/);
      expect(result.sortOrder).toBe(0);
    });
  });

  describe('update', () => {
    it('rejects publishing a course with zero slides', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1', status: 'DRAFT', slides: { slides: [] }, author: {},
      });
      await expect(service.update('c1', { status: 'PUBLISHED' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorder', () => {
    it('rejects duplicate ids', async () => {
      await expect(service.reorder({ items: [{ id: 'a', sortOrder: 0 }, { id: 'a', sortOrder: 1 }] } as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects when an id does not exist', async () => {
      prisma.course.count.mockResolvedValue(1);
      await expect(service.reorder({ items: [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 1 }] } as any)).rejects.toThrow(BadRequestException);
    });
  });
});
