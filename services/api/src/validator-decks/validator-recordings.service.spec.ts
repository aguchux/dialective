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
      { id: 'rec-1', direction: 'ENGLISH_TO_DIALECT', translationText: 'hello', word: { text: 'hello' }, sentence: null },
    ]);
    prisma.validatorDeckItem.findMany.mockResolvedValue([]);

    const result = await service.listAll(baseQuery, 'user-1');

    expect(result.items[0].myDeckId).toBeNull();
  });

  it('reports myDeckId when the recording is in one of the caller own decks', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      { id: 'rec-1', direction: 'ENGLISH_TO_DIALECT', translationText: 'hello', word: { text: 'hello' }, sentence: null },
    ]);
    prisma.validatorDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1', deckId: 'deck-1' }]);

    const result = await service.listAll(baseQuery, 'user-1');

    expect(result.items[0].myDeckId).toBe('deck-1');
  });

  it('scopes the deck-membership lookup to the caller own decks, not every validator', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      { id: 'rec-1', direction: 'ENGLISH_TO_DIALECT', translationText: 'hello', word: { text: 'hello' }, sentence: null },
    ]);

    await service.listAll(baseQuery, 'user-1');

    expect(prisma.validatorDeckItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recordingId: { in: ['rec-1'] }, deck: { ownerUserId: 'user-1' } },
      }),
    );
  });

  it('picks the most recently-added deck when the recording is in more than one of the caller own decks', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([
      { id: 'rec-1', direction: 'ENGLISH_TO_DIALECT', translationText: 'hello', word: { text: 'hello' }, sentence: null },
    ]);
    // Service orders by addedAt desc -- most recent first -- so the mock
    // returns them in that order and the first entry per recordingId wins.
    prisma.validatorDeckItem.findMany.mockResolvedValue([
      { recordingId: 'rec-1', deckId: 'deck-newer' },
      { recordingId: 'rec-1', deckId: 'deck-older' },
    ]);

    const result = await service.listAll(baseQuery, 'user-1');

    expect(result.items[0].myDeckId).toBe('deck-newer');
  });

  it('skips the deck-membership query entirely when the page has no recordings', async () => {
    const { service, prisma } = setup();
    prisma.wordRecording.findMany.mockResolvedValue([]);

    await service.listAll(baseQuery, 'user-1');

    expect(prisma.validatorDeckItem.findMany).not.toHaveBeenCalled();
  });
});
