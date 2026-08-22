import { WordGeneratorService } from './word-generator.service';

describe('WordGeneratorService.selectWordsForComposition', () => {
  function setup(words: { id: string; text: string; partOfSpeech: string | null }[]) {
    const prisma: any = {
      word: { findMany: jest.fn().mockResolvedValue(words.filter((w) => w.partOfSpeech !== null)) },
    };
    const service = new WordGeneratorService(prisma as never);
    return { service, prisma };
  }

  // Access the private method the same way this codebase's other specs
  // reach into services for unit-level coverage of non-exported logic
  // (see word-generator.pool-cap.spec.ts).
  function callSelect(
    service: WordGeneratorService,
    wordsPerItem: number,
    count: number,
  ): Promise<{ id: string; text: string; partOfSpeech: string }[][]> {
    return (service as any).selectWordsForComposition(wordsPerItem, count);
  }

  const CLASSIFIED_POOL = [
    { id: 'n1', text: 'dog', partOfSpeech: 'NOUN' },
    { id: 'n2', text: 'market', partOfSpeech: 'NOUN' },
    { id: 'v1', text: 'run', partOfSpeech: 'VERB' },
    { id: 'v2', text: 'buy', partOfSpeech: 'VERB' },
    { id: 'a1', text: 'quick', partOfSpeech: 'ADJECTIVE' },
  ];

  it('returns the requested number of distinct-word sets, each of the requested size', async () => {
    const { service } = setup(CLASSIFIED_POOL);

    const sets = await callSelect(service, 3, 4);

    expect(sets).toHaveLength(4);
    for (const set of sets) {
      expect(set).toHaveLength(3);
      const ids = set.map((w) => w.id);
      expect(new Set(ids).size).toBe(3); // no repeated word within a set
    }
  });

  it('biases each set to include a noun and a verb when both are available', async () => {
    const { service } = setup(CLASSIFIED_POOL);

    const sets = await callSelect(service, 2, 10);

    for (const set of sets) {
      const pos = set.map((w) => w.partOfSpeech);
      expect(pos).toContain('NOUN');
      expect(pos).toContain('VERB');
    }
  });

  it('excludes unclassified (partOfSpeech: null) words entirely', async () => {
    const { service, prisma } = setup([
      ...CLASSIFIED_POOL,
      { id: 'u1', text: 'mystery', partOfSpeech: null },
    ]);

    await callSelect(service, 2, 1);

    expect(prisma.word.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partOfSpeech: { not: null } } }),
    );
  });

  it('returns fewer sets than requested when the classified pool is too small to fill them all', async () => {
    const { service } = setup([
      { id: 'n1', text: 'dog', partOfSpeech: 'NOUN' },
      { id: 'v1', text: 'run', partOfSpeech: 'VERB' },
    ]);

    // Only 2 classified words exist -- asking for 3-word sets can never
    // succeed even once, since every set would need a 3rd distinct word.
    const sets = await callSelect(service, 3, 5);

    expect(sets).toEqual([]);
  });

  it('returns an empty array immediately when count is 0 or negative', async () => {
    const { service, prisma } = setup(CLASSIFIED_POOL);

    const sets = await callSelect(service, 2, 0);

    expect(sets).toEqual([]);
    expect(prisma.word.findMany).not.toHaveBeenCalled();
  });
});
