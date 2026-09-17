import { ValidatorRecordingsService } from './validator-recordings.service';

describe('ValidatorRecordingsService', () => {
  function setup() {
    const prisma: any = {
      wordRecording: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      validatorDeckItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      validatorDialectAssignment: {
        findMany: jest.fn().mockResolvedValue([{ dialect: { tag: 'ig' } }]),
      },
    };
    const storage: any = {
      createPresignedDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://example.com/audio' }),
    };
    const service = new ValidatorRecordingsService(prisma, storage);
    return { service, prisma, storage };
  }

  const baseQuery = {
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt' as const,
    sortDir: 'desc' as const,
  };

  it('reports myDeckId null for a recording not in any of the caller own decks', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        direction: 'ENGLISH_TO_DIALECT',
        translationText: 'hello',
        word: { text: 'hello' },
        sentence: null,
      },
    ]);
    prisma.validatorDeckItem.findMany.mockResolvedValue([]);

    const result = await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

    expect(result.items[0].myDeckId).toBeNull();
  });

  it('reports myDeckId when the recording is in one of the caller own decks', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        direction: 'ENGLISH_TO_DIALECT',
        translationText: 'hello',
        word: { text: 'hello' },
        sentence: null,
      },
    ]);
    prisma.validatorDeckItem.findMany.mockResolvedValue([
      { recordingId: 'rec-1', deckId: 'deck-1' },
    ]);

    const result = await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

    expect(result.items[0].myDeckId).toBe('deck-1');
  });

  it('scopes the deck-membership lookup to the caller own decks, not every validator', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        direction: 'ENGLISH_TO_DIALECT',
        translationText: 'hello',
        word: { text: 'hello' },
        sentence: null,
      },
    ]);

    await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

    expect(prisma.validatorDeckItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recordingId: { in: ['rec-1'] }, deck: { ownerUserId: 'user-1' } },
      }),
    );
  });

  it('picks the most recently-added deck when the recording is in more than one of the caller own decks', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        direction: 'ENGLISH_TO_DIALECT',
        translationText: 'hello',
        word: { text: 'hello' },
        sentence: null,
      },
    ]);
    // Service orders by addedAt desc -- most recent first -- so the mock
    // returns them in that order and the first entry per recordingId wins.
    prisma.validatorDeckItem.findMany.mockResolvedValue([
      { recordingId: 'rec-1', deckId: 'deck-newer' },
      { recordingId: 'rec-1', deckId: 'deck-older' },
    ]);

    const result = await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

    expect(result.items[0].myDeckId).toBe('deck-newer');
  });

  it('skips the deck-membership query entirely when the page has no recordings', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([]);

    await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

    expect(prisma.validatorDeckItem.findMany).not.toHaveBeenCalled();
  });

  describe('dialect scoping', () => {
    it('restricts a validator to their assigned dialects', async () => {
      const { service, prisma } = setup();
      prisma.validatorDialectAssignment.findMany.mockResolvedValue([
        { dialect: { tag: 'ig' } },
        { dialect: { tag: 'yo' } },
      ]);

      await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dialectTag: { in: ['ig', 'yo'] } }),
        }),
      );
    });

    it('narrows a client-supplied dialectTag to the intersection with assignments, never widening past them', async () => {
      const { service, prisma } = setup();
      prisma.validatorDialectAssignment.findMany.mockResolvedValue([{ dialect: { tag: 'ig' } }]);

      await service.listAll({ ...baseQuery, dialectTag: 'yo' }, 'user-1', 'VALIDATOR');

      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ dialectTag: '__none__' }) }),
      );
    });

    it('returns an empty page without querying recordings when the validator has zero assignments', async () => {
      const { service, prisma } = setup();
      prisma.validatorDialectAssignment.findMany.mockResolvedValue([]);

      const result = await service.listAll(baseQuery, 'user-1', 'VALIDATOR');

      expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
      expect(prisma.wordRecording.findMany).not.toHaveBeenCalled();
    });

    it('bypasses dialect scoping entirely for an admin', async () => {
      const { service, prisma } = setup();

      await service.listAll(baseQuery, 'admin-1', 'ADMIN');

      expect(prisma.validatorDialectAssignment.findMany).not.toHaveBeenCalled();
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ dialectTag: expect.anything() }),
        }),
      );
    });
  });
});
