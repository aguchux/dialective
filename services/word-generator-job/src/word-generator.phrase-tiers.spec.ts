import { WordGeneratorService } from './word-generator.service';

describe('WordGeneratorService.runPhraseTierGeneration', () => {
  function setup(settingsOverrides: Record<string, unknown> = {}) {
    const prisma: any = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({
          llmProviderOrder: 'openai,deepseek,anthropic',
          phraseTierGenerationEnabled: true,
          phraseTierItemsPerTierPerRun: 1,
          ...settingsOverrides,
        }),
      },
      dialect: {
        findMany: jest.fn().mockResolvedValue([{ tag: 'ig' }]),
        findUnique: jest.fn().mockResolvedValue({ name: 'Igbo' }),
      },
      word: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', text: 'dog', partOfSpeech: 'NOUN' },
          { id: 'v1', text: 'runs', partOfSpeech: 'VERB' },
          { id: 'a1', text: 'quick', partOfSpeech: 'ADJECTIVE' },
        ]),
      },
      sentence: {
        findMany: jest.fn().mockResolvedValue([]), // no pre-existing sentences -> nothing deduped
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: `sentence-${Math.random()}`, ...data })),
      },
      sentenceTranslation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    const service = new WordGeneratorService(prisma as never);
    // Same bypass pattern as word-generator.backfill.spec.ts -- avoids
    // constructing real LLM providers, only chain.generate is exercised by
    // the composition/translation call sites this test covers.
    (service as any).chain = {
      generate: jest.fn().mockResolvedValue({ items: ['quick dog runs'], provider: 'openai' }),
      generateStructured: jest.fn().mockResolvedValue({
        items: [
          { text: 'the', partOfSpeech: 'OTHER' },
          { text: 'quick', partOfSpeech: 'ADJECTIVE' },
          { text: 'dog', partOfSpeech: 'NOUN' },
        ],
        provider: 'openai',
      }),
    };
    return { service, prisma };
  }

  function callRun(service: WordGeneratorService): Promise<void> {
    return (service as any).runPhraseTierGeneration();
  }

  it('skips entirely when phraseTierGenerationEnabled is false', async () => {
    const { service, prisma } = setup({ phraseTierGenerationEnabled: false });

    await callRun(service);

    expect(prisma.word.findMany).not.toHaveBeenCalled();
    expect(prisma.sentence.create).not.toHaveBeenCalled();
  });

  it('composes phrases for each configured tier and stamps wordCount on the inserted Sentence row', async () => {
    const { service, prisma } = setup();
    // 'quick dog runs' -- 3 words, fits tier 1's [2,3] range, and uses all 3 selected words.

    await callRun(service);

    // 5 tiers configured in phrase-tiers.const.ts -> at least one Sentence insert attempted
    expect(prisma.sentence.create.mock.calls.length).toBeGreaterThan(0);
    expect(prisma.sentence.create.mock.calls[0][0].data).toMatchObject({
      text: 'quick dog runs',
      wordCount: 3,
    });
  });

  it('discards a composed phrase whose word count falls outside the tier range', async () => {
    const { service, prisma } = setup({ phraseTierItemsPerTierPerRun: 1 });
    // Tier 1 wants 2-3 words; this composition returns 6 -- must be discarded, not inserted.
    (service as any).chain.generate = jest
      .fn()
      .mockResolvedValue({ items: ['the quick dog runs very fast'], provider: 'openai' });

    await callRun(service);

    expect(prisma.sentence.create).not.toHaveBeenCalled();
  });

  it('never translates a Sentence into a second per-dialect Sentence row -- only SentenceTranslation rows', async () => {
    const { service, prisma } = setup();

    await callRun(service);

    expect(prisma.sentence.create).toHaveBeenCalledTimes(1);
    expect(prisma.sentenceTranslation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dialectTag: 'ig' }),
      }),
    );
  });
});
