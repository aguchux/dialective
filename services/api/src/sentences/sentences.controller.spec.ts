import { Prisma } from '@dialectiva/db';
import { SentencesController } from './sentences.controller';

describe('SentencesController bulk delete', () => {
  function setup() {
    const prisma = {
      sentence: {
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ id: 'sentence-1' }, { id: 'sentence-2' }]),
      },
    };
    const controller = new SentencesController(prisma as never);
    return { controller, prisma };
  }

  it('deletes exactly the given ids when dto.ids is provided', async () => {
    const { controller, prisma } = setup();

    const result = await controller.bulkDeleteSentences({ ids: ['a', 'b', 'c'] });

    expect(prisma.sentence.delete).toHaveBeenCalledTimes(3);
    expect(prisma.sentence.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 3, skipped: 0 });
  });

  it('resolves ids from the current search filter for Clear All when dto.ids is omitted', async () => {
    const { controller, prisma } = setup();

    const result = await controller.bulkDeleteSentences({ search: 'hello' });

    expect(prisma.sentence.findMany).toHaveBeenCalledWith({
      where: { text: { contains: 'hello', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(prisma.sentence.delete).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deleted: 2, skipped: 0 });
  });

  it('tallies FK-conflicted rows as skipped instead of aborting the batch', async () => {
    const { controller, prisma } = setup();
    prisma.sentence.delete
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

    const result = await controller.bulkDeleteSentences({ ids: ['a', 'b'] });

    expect(result).toEqual({ deleted: 1, skipped: 1 });
  });

  it('rethrows an unexpected error instead of silently skipping it', async () => {
    const { controller, prisma } = setup();
    prisma.sentence.delete.mockRejectedValueOnce(new Error('db down'));

    await expect(controller.bulkDeleteSentences({ ids: ['a'] })).rejects.toThrow('db down');
  });
});
