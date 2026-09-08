import { WordGeneratorService } from './word-generator.service';

describe('WordGeneratorService pool-cap gate', () => {
  function setup(
    sentenceTranslationCounts: { dialectTag: string; _count: { _all: number } }[],
    wordTranslationCounts: { dialectTag: string; _count: { _all: number } }[],
  ) {
    const prisma: any = {
      sentenceTranslation: { groupBy: jest.fn().mockResolvedValue(sentenceTranslationCounts) },
      wordTranslation: { groupBy: jest.fn().mockResolvedValue(wordTranslationCounts) },
    };
    const service = new WordGeneratorService(prisma as never);
    return { service, prisma };
  }

  // Access the private method the same way this codebase's other specs
  // reach into services for unit-level coverage of non-exported logic.
  function callFilter(
    service: WordGeneratorService,
    dialectTags: string[],
    maxPoolPerDialect: number,
  ): Promise<string[]> {
    return (service as any).filterDialectsUnderPoolCap(dialectTags, maxPoolPerDialect);
  }

  it('keeps a dialect whose combined sentence + word-translation pool is below the cap', async () => {
    const { service } = setup(
      [{ dialectTag: 'ig', _count: { _all: 5 } }],
      [{ dialectTag: 'ig', _count: { _all: 3 } }],
    );

    const result = await callFilter(service, ['ig'], 20);

    expect(result).toEqual(['ig']);
  });

  it('excludes a dialect whose combined pool has reached the cap', async () => {
    const { service } = setup(
      [{ dialectTag: 'ig', _count: { _all: 15 } }],
      [{ dialectTag: 'ig', _count: { _all: 5 } }],
    );

    const result = await callFilter(service, ['ig'], 20);

    expect(result).toEqual([]);
  });

  it('treats a dialect with no rows in either table as pool size 0 (never capped out at cap=0 edge)', async () => {
    const { service } = setup([], []);

    const result = await callFilter(service, ['yo'], 20);

    expect(result).toEqual(['yo']);
  });

  it('evaluates each dialect independently -- one capped dialect does not affect another under its cap', async () => {
    const { service } = setup(
      [
        { dialectTag: 'ig', _count: { _all: 20 } },
        { dialectTag: 'yo', _count: { _all: 2 } },
      ],
      [],
    );

    const result = await callFilter(service, ['ig', 'yo'], 20);

    expect(result).toEqual(['yo']);
  });

  it('returns an empty array immediately for an empty dialect list without querying', async () => {
    const { service, prisma } = setup([], []);

    const result = await callFilter(service, [], 20);

    expect(result).toEqual([]);
    expect(prisma.sentenceTranslation.groupBy).not.toHaveBeenCalled();
  });

  it('excludes translations of disabled sentences/words from the pool-size count so a disabled backlog never blocks generation', async () => {
    const { service, prisma } = setup([], []);

    await callFilter(service, ['ig'], 20);

    expect(prisma.sentenceTranslation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dialectTag: { in: ['ig'] }, sentence: { isDisabled: false } },
      }),
    );
    expect(prisma.wordTranslation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dialectTag: { in: ['ig'] }, word: { isDisabled: false } },
      }),
    );
  });
});
