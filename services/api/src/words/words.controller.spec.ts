import { Prisma } from '@dialectiva/db';
import { WordsController } from './words.controller';

describe('WordsController bulk delete', () => {
  function setup() {
    const prisma = {
      word: {
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ id: 'word-1' }, { id: 'word-2' }]),
      },
    };
    const controller = new WordsController({} as never, prisma as never);
    return { controller, prisma };
  }

  it('deletes exactly the given ids when dto.ids is provided', async () => {
    const { controller, prisma } = setup();

    const result = await controller.bulkDeleteWords({ ids: ['a', 'b', 'c'] });

    expect(prisma.word.delete).toHaveBeenCalledTimes(3);
    expect(prisma.word.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 3, skipped: 0 });
  });

  it('resolves ids from the current filter for Clear All when dto.ids is omitted', async () => {
    const { controller, prisma } = setup();

    const result = await controller.bulkDeleteWords({ search: 'run', partOfSpeech: 'VERB' as never });

    expect(prisma.word.findMany).toHaveBeenCalledWith({
      where: {
        text: { contains: 'run', mode: 'insensitive' },
        partOfSpeech: 'VERB',
      },
      select: { id: true },
    });
    expect(prisma.word.delete).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deleted: 2, skipped: 0 });
  });

  it('tallies FK-conflicted rows as skipped instead of aborting the batch', async () => {
    const { controller, prisma } = setup();
    prisma.word.delete
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      )
      .mockResolvedValueOnce({});

    const result = await controller.bulkDeleteWords({ ids: ['a', 'b', 'c'] });

    expect(result).toEqual({ deleted: 2, skipped: 1 });
  });

  it('rethrows an unexpected error instead of silently skipping it', async () => {
    const { controller, prisma } = setup();
    prisma.word.delete.mockRejectedValueOnce(new Error('db down'));

    await expect(controller.bulkDeleteWords({ ids: ['a'] })).rejects.toThrow('db down');
  });
});
