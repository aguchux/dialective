import { WordsController } from './words.controller';

describe('WordsController delete', () => {
  function setup() {
    const prisma = {
      word: {
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ id: 'word-1' }, { id: 'word-2' }]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'word-1', isDisabled: true }),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      wordRecording: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wordTrainingAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const controller = new WordsController({} as never, prisma as never);
    return { controller, prisma };
  }

  describe('single delete', () => {
    it('deletes a word with no unsettled activity', async () => {
      const { controller, prisma } = setup();

      const result = await controller.deleteWord('word-1');

      expect(prisma.wordRecording.findFirst).toHaveBeenCalledWith({
        where: { wordId: 'word-1', status: { in: ['PENDING', 'TRANSCRIBED', 'SCORED'] } },
        select: { id: true },
      });
      expect(prisma.word.delete).toHaveBeenCalledWith({ where: { id: 'word-1' } });
      expect(result).toEqual({ id: 'word-1', deleted: true });
    });

    it('refuses to delete a word with a PENDING/TRANSCRIBED/SCORED recording', async () => {
      const { controller, prisma } = setup();
      prisma.wordRecording.findFirst.mockResolvedValueOnce({ id: 'rec-1' });

      await expect(controller.deleteWord('word-1')).rejects.toThrow(
        'Word has recordings awaiting scoring/settlement or an open training assignment',
      );
      expect(prisma.word.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a word with an open (unconsumed) training assignment', async () => {
      const { controller, prisma } = setup();
      prisma.wordTrainingAssignment.findFirst.mockResolvedValueOnce({ id: 'assignment-1' });

      await expect(controller.deleteWord('word-1')).rejects.toThrow(
        'Word has recordings awaiting scoring/settlement or an open training assignment',
      );
      expect(prisma.word.delete).not.toHaveBeenCalled();
    });
  });

  describe('disable toggle', () => {
    it('disables a word without touching its recordings/assignments', async () => {
      const { controller, prisma } = setup();

      const result = await controller.setWordDisabled('word-1', { disabled: true });

      expect(prisma.word.update).toHaveBeenCalledWith({
        where: { id: 'word-1' },
        data: { isDisabled: true },
      });
      expect(result).toEqual({ id: 'word-1', isDisabled: true });
    });

    it('re-enables a disabled word', async () => {
      const { controller, prisma } = setup();
      prisma.word.update.mockResolvedValueOnce({ id: 'word-1', isDisabled: false });

      const result = await controller.setWordDisabled('word-1', { disabled: false });

      expect(prisma.word.update).toHaveBeenCalledWith({
        where: { id: 'word-1' },
        data: { isDisabled: false },
      });
      expect(result).toEqual({ id: 'word-1', isDisabled: false });
    });
  });

  describe('list filter', () => {
    it('lists only active (non-disabled) words by default', async () => {
      const { controller, prisma } = setup();

      await controller.listWordsForAdmin({ page: 1, pageSize: 20, disabled: false });

      expect(prisma.word.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isDisabled: false } }),
      );
    });

    it('lists only disabled words when the Disabled tab asks for it', async () => {
      const { controller, prisma } = setup();

      await controller.listWordsForAdmin({ page: 1, pageSize: 20, disabled: true });

      expect(prisma.word.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isDisabled: true } }),
      );
    });
  });

  describe('bulk delete', () => {
    it('deletes exactly the given ids when dto.ids is provided', async () => {
      const { controller, prisma } = setup();

      const result = await controller.bulkDeleteWords({ ids: ['a', 'b', 'c'] });

      expect(prisma.word.delete).toHaveBeenCalledTimes(3);
      expect(prisma.word.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: 3, skipped: 0 });
    });

    it('resolves ids from the current filter for Clear All when dto.ids is omitted', async () => {
      const { controller, prisma } = setup();

      const result = await controller.bulkDeleteWords({
        search: 'run',
        partOfSpeech: 'VERB' as never,
      });

      expect(prisma.word.findMany).toHaveBeenCalledWith({
        where: {
          isDisabled: false,
          text: { contains: 'run', mode: 'insensitive' },
          partOfSpeech: 'VERB',
        },
        select: { id: true },
      });
      expect(prisma.word.delete).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ deleted: 2, skipped: 0 });
    });

    it('skips words with unsettled activity instead of cascading their recordings away', async () => {
      const { controller, prisma } = setup();
      prisma.wordRecording.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'rec-1' })
        .mockResolvedValueOnce(null);

      const result = await controller.bulkDeleteWords({ ids: ['a', 'b', 'c'] });

      expect(prisma.word.delete).toHaveBeenCalledTimes(2);
      expect(prisma.word.delete).not.toHaveBeenCalledWith({ where: { id: 'b' } });
      expect(result).toEqual({ deleted: 2, skipped: 1 });
    });

    it('rethrows an unexpected error instead of silently skipping it', async () => {
      const { controller, prisma } = setup();
      prisma.word.delete.mockRejectedValueOnce(new Error('db down'));

      await expect(controller.bulkDeleteWords({ ids: ['a'] })).rejects.toThrow('db down');
    });
  });

  describe('bulk disable', () => {
    it('disables exactly the given ids when dto.ids is provided', async () => {
      const { controller, prisma } = setup();

      const result = await controller.bulkSetWordsDisabled({
        ids: ['a', 'b', 'c'],
        setDisabled: true,
      });

      expect(prisma.word.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b', 'c'] } },
        data: { isDisabled: true },
      });
      expect(result).toEqual({ updated: 3 });
    });

    it('re-enables exactly the given ids when setDisabled is false', async () => {
      const { controller, prisma } = setup();
      prisma.word.updateMany.mockResolvedValueOnce({ count: 2 });

      const result = await controller.bulkSetWordsDisabled({ ids: ['a', 'b'], setDisabled: false });

      expect(prisma.word.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] } },
        data: { isDisabled: false },
      });
      expect(result).toEqual({ updated: 2 });
    });

    it('resolves the matching rows from the current filter for Clear-All-style disable when ids is omitted', async () => {
      const { controller, prisma } = setup();

      await controller.bulkSetWordsDisabled({
        setDisabled: true,
        search: 'run',
        partOfSpeech: 'VERB' as never,
      });

      expect(prisma.word.updateMany).toHaveBeenCalledWith({
        where: {
          isDisabled: false,
          text: { contains: 'run', mode: 'insensitive' },
          partOfSpeech: 'VERB',
        },
        data: { isDisabled: true },
      });
    });
  });
});
