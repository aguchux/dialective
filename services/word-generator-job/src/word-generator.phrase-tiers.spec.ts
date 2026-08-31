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
          { id: 'v1', text: 'run', partOfSpeech: 'VERB' },
          { id: 'a1', text: 'quick', partOfSpeech: 'ADJECTIVE' },
        ]),
      },
      prompt: {
        findMany: jest.fn().mockResolvedValue([]), // no pre-existing en-us prompts -> nothing deduped
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: `prompt-${Math.random()}`, ...data })),
      },
      promptWord: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
      promptTranslation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    const service = new WordGeneratorService(prisma as never);
    // Same bypass pattern as word-generator.backfill.spec.ts -- avoids
    // constructing real LLM providers, only chain.generate is exercised by
    // the composition/translation/segmentation call sites this test covers.
    (service as any).chain = {
      generate: jest.fn().mockResolvedValue({ items: ['the quick dog'], provider: 'openai' }),
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
    expect(prisma.prompt.create).not.toHaveBeenCalled();
  });

  it('composes phrases for each configured tier and stamps phraseWordCountMin/Max on the inserted English Prompt row', async () => {
    const { service, prisma } = setup();
    (service as any).chain.generate = jest.fn().mockResolvedValue({
      items: ['the quick dog'], // 3 words, fits tier 1's [2,3] range
      provider: 'openai',
    });

    await callRun(service);

    // 5 tiers configured in phrase-tiers.const.ts -> at least one en-us insert per tier attempted
    const enUsCreateCalls = prisma.prompt.create.mock.calls.filter(
      ([args]: any) => args.data.dialectTag === 'en-us',
    );
    expect(enUsCreateCalls.length).toBeGreaterThan(0);
    expect(enUsCreateCalls[0][0].data).toMatchObject({
      origin: 'WORD_COMPOSED',
      phraseWordCountMin: 2,
      phraseWordCountMax: 3,
    });
  });

  it('discards a composed phrase whose word count falls outside the tier range', async () => {
    const { service, prisma } = setup({ phraseTierItemsPerTierPerRun: 1 });
    // Tier 1 wants 2-3 words; this composition returns 6 -- must be discarded, not inserted.
    (service as any).chain.generate = jest
      .fn()
      .mockResolvedValue({ items: ['the quick brown dog runs fast'], provider: 'openai' });

    await callRun(service);

    const enUsCreateCalls = prisma.prompt.create.mock.calls.filter(
      ([args]: any) => args.data.dialectTag === 'en-us' && args.data.phraseWordCountMin === 2,
    );
    expect(enUsCreateCalls).toHaveLength(0);
  });

  it('stamps the same tier range on the translated-dialect Prompt row', async () => {
    const { service, prisma } = setup();
    (service as any).chain.generate = jest
      .fn()
      .mockResolvedValueOnce({ items: ['the quick dog'], provider: 'openai' }) // composition
      .mockResolvedValue({ items: ['nkịta ọsọ ọsọ'], provider: 'openai' }); // translation(s)

    await callRun(service);

    const dialectCreateCalls = prisma.prompt.create.mock.calls.filter(
      ([args]: any) => args.data.dialectTag === 'ig',
    );
    expect(dialectCreateCalls.length).toBeGreaterThan(0);
    expect(dialectCreateCalls[0][0].data).toMatchObject({
      phraseWordCountMin: 2,
      phraseWordCountMax: 3,
    });
  });

  it('leaves phraseWordCountMin/Max null for the regular (non-tier) composition path', async () => {
    const prisma: any = {
      word: { findMany: jest.fn().mockResolvedValue([{ id: 'n1', text: 'dog', partOfSpeech: 'NOUN' }]) },
      prompt: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'p1', ...data })),
      },
    };
    const service = new WordGeneratorService(prisma as never);

    await (service as any).insertComposedPrompts([{ text: 'a sentence', wordSet: [] }]);

    expect(prisma.prompt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ phraseWordCountMin: expect.anything() }),
      }),
    );
  });
});
