import { SentencesController } from './sentences.controller';

describe('SentencesController delete', () => {
  function setup() {
    const prisma = {
      sentence: {
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ id: 'sentence-1' }, { id: 'sentence-2' }]),
      },
      wordRecording: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wordTrainingAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const controller = new SentencesController(prisma as never);
    return { controller, prisma };
  }

  describe('single delete', () => {
    it('deletes a sentence with no unsettled activity', async () => {
      const { controller, prisma } = setup();

      const result = await controller.deleteSentence('sentence-1');

      expect(prisma.wordRecording.findFirst).toHaveBeenCalledWith({
        where: { sentenceId: 'sentence-1', status: { in: ['PENDING', 'TRANSCRIBED', 'SCORED'] } },
        select: { id: true },
      });
      expect(prisma.sentence.delete).toHaveBeenCalledWith({ where: { id: 'sentence-1' } });
      expect(result).toEqual({ id: 'sentence-1', deleted: true });
    });

    it('refuses to delete a sentence with a PENDING/TRANSCRIBED/SCORED recording', async () => {
      const { controller, prisma } = setup();
      prisma.wordRecording.findFirst.mockResolvedValueOnce({ id: 'rec-1' });

      await expect(controller.deleteSentence('sentence-1')).rejects.toThrow(
        'Sentence has recordings awaiting scoring/settlement or an open training assignment',
      );
      expect(prisma.sentence.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a sentence with an open (unconsumed) training assignment', async () => {
      const { controller, prisma } = setup();
      prisma.wordTrainingAssignment.findFirst.mockResolvedValueOnce({ id: 'assignment-1' });

      await expect(controller.deleteSentence('sentence-1')).rejects.toThrow(
        'Sentence has recordings awaiting scoring/settlement or an open training assignment',
      );
      expect(prisma.sentence.delete).not.toHaveBeenCalled();
    });
  });

  describe('bulk delete', () => {
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

    it('skips sentences with unsettled activity instead of cascading their recordings away', async () => {
      const { controller, prisma } = setup();
      prisma.wordTrainingAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'assignment-1' });

      const result = await controller.bulkDeleteSentences({ ids: ['a', 'b'] });

      expect(prisma.sentence.delete).toHaveBeenCalledTimes(1);
      expect(prisma.sentence.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
      expect(result).toEqual({ deleted: 1, skipped: 1 });
    });

    it('rethrows an unexpected error instead of silently skipping it', async () => {
      const { controller, prisma } = setup();
      prisma.sentence.delete.mockRejectedValueOnce(new Error('db down'));

      await expect(controller.bulkDeleteSentences({ ids: ['a'] })).rejects.toThrow('db down');
    });
  });
});
