import { WordGeneratorService } from './word-generator.service';

describe('WordGeneratorService backfillDialectTranslations', () => {
  function setup() {
    const prisma: any = {
      word: { findMany: jest.fn().mockResolvedValue([]) },
      prompt: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      dialect: { findUnique: jest.fn().mockResolvedValue({ name: 'Igbo' }) },
      wordTranslation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      promptTranslation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    const service = new WordGeneratorService(prisma as never);
    // Bypass the real LLM providers constructed in WordGeneratorService's
    // constructor -- translateAndLinkWord/translateAndLinkPrompt only ever
    // call chain.generateStructured/chain.generate, so a minimal mock chain
    // is enough to unit-test backfill's row-selection logic in isolation.
    (service as any).chain = {
      generateStructured: jest.fn().mockResolvedValue({
        items: [{ text: 'nnukwu', partOfSpeech: 'ADJECTIVE' }],
        provider: 'openai',
      }),
      generate: jest.fn().mockResolvedValue({ items: ['nnukwu'], provider: 'openai' }),
    };
    return { service, prisma };
  }

  function callBackfill(
    service: WordGeneratorService,
    dialectTag: string,
    wordsPerItem: number,
    maxItemsThisRun: number,
  ) {
    return (service as any).backfillDialectTranslations(
      dialectTag,
      wordsPerItem,
      ['openai', 'deepseek', 'anthropic'],
      maxItemsThisRun,
    );
  }

  it('queries Word rows missing a translation for this dialect, oldest first, capped at maxItemsThisRun', async () => {
    const { service, prisma } = setup();
    prisma.word.findMany.mockResolvedValue([{ id: 'w1', text: 'big' }]);

    const result = await callBackfill(service, 'ig', 1, 5);

    expect(prisma.word.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { translations: { none: { dialectTag: 'ig' } } },
        orderBy: { createdAt: 'asc' },
        take: 5,
      }),
    );
    expect(result).toEqual({ backfilled: 1, skippedDuplicate: 0, failed: 0 });
    expect(prisma.wordTranslation.create).toHaveBeenCalledWith({
      data: { wordId: 'w1', dialectTag: 'ig', text: 'nnukwu', partOfSpeech: 'ADJECTIVE' },
    });
  });

  it('queries Prompt rows (en-us, active) missing a translation for this dialect when wordsPerItem > 1', async () => {
    const { service, prisma } = setup();
    prisma.prompt.findMany.mockResolvedValue([{ id: 'p1', text: 'the big house' }]);

    const result = await callBackfill(service, 'ig', 3, 5);

    expect(prisma.prompt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dialectTag: 'en-us', active: true, translations: { none: { dialectTag: 'ig' } } },
        orderBy: { createdAt: 'asc' },
        take: 5,
      }),
    );
    expect(result.backfilled).toBe(1);
  });

  it('returns zero counts and does not query the database when maxItemsThisRun is 0 (dialect already at cap)', async () => {
    const { service, prisma } = setup();

    const result = await callBackfill(service, 'ig', 1, 0);

    expect(result).toEqual({ backfilled: 0, skippedDuplicate: 0, failed: 0 });
    expect(prisma.word.findMany).not.toHaveBeenCalled();
  });

  it('counts a duplicate outcome (translation already exists) separately from backfilled', async () => {
    const { service, prisma } = setup();
    prisma.word.findMany.mockResolvedValue([{ id: 'w1', text: 'big' }]);
    prisma.wordTranslation.findUnique.mockResolvedValue({ id: 'existing' });

    const result = await callBackfill(service, 'ig', 1, 5);

    expect(result).toEqual({ backfilled: 0, skippedDuplicate: 1, failed: 0 });
    expect(prisma.wordTranslation.create).not.toHaveBeenCalled();
  });
});

describe('WordGeneratorService run() backfill-before-generation ordering', () => {
  function setupRun() {
    const prisma: any = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({
          llmGenerationEnabled: true,
          singleWordGenerationEnabled: true,
          llmProviderOrder: 'openai,deepseek,anthropic',
          llmWordsPerItem: 1,
          llmItemsPerRun: 15,
          llmMaxTotalGeneratedItems: 5000,
          llmMaxPoolPerDialect: 50,
          llmBackfillItemsPerDialectPerRun: 10,
        }),
      },
      dialect: {
        findMany: jest.fn().mockResolvedValue([{ tag: 'ig' }]),
        findUnique: jest.fn().mockResolvedValue({ name: 'Igbo' }),
      },
      prompt: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      wordTranslation: {
        groupBy: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      word: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new WordGeneratorService(prisma as never);
    (service as any).chain = {
      generateStructured: jest.fn().mockResolvedValue({ items: [], provider: 'openai' }),
      generate: jest.fn().mockResolvedValue({ items: [], provider: 'openai' }),
    };
    return { service, prisma };
  }

  it('queries for backfillable Word rows before generating any brand-new English content', async () => {
    const { service, prisma } = setupRun();
    const callOrder: string[] = [];
    prisma.word.findMany.mockImplementation(() => {
      callOrder.push('backfill-query');
      return Promise.resolve([]);
    });
    (service as any).chain.generateStructured = jest.fn().mockImplementation(() => {
      callOrder.push('generate-new-content');
      return Promise.resolve({ items: [], provider: 'openai' });
    });

    await service.run();

    expect(callOrder).toEqual(['backfill-query', 'generate-new-content']);
  });

  it('does nothing (no backfill query, no generation) when word generation is disabled', async () => {
    const { service, prisma } = setupRun();
    prisma.platformSettings.upsert.mockResolvedValue({ llmGenerationEnabled: false });

    await service.run();

    expect(prisma.word.findMany).not.toHaveBeenCalled();
    expect(prisma.dialect.findMany).not.toHaveBeenCalled();
  });

  it('does not generate new content when the global max total generated items cap is already reached', async () => {
    const { service, prisma } = setupRun();
    prisma.platformSettings.upsert.mockResolvedValue({
      llmGenerationEnabled: true,
      llmProviderOrder: 'openai,deepseek,anthropic',
      llmWordsPerItem: 1,
      llmItemsPerRun: 15,
      llmMaxTotalGeneratedItems: 100,
      llmMaxPoolPerDialect: 50,
      llmBackfillItemsPerDialectPerRun: 10,
    });
    prisma.word.count.mockResolvedValue(100);

    await service.run();

    expect(prisma.word.findMany).not.toHaveBeenCalled();
    expect((service as any).chain.generateStructured).not.toHaveBeenCalled();
  });

  it('clips generation batch size to the remaining global headroom', async () => {
    const { service, prisma } = setupRun();
    prisma.platformSettings.upsert.mockResolvedValue({
      llmGenerationEnabled: true,
      singleWordGenerationEnabled: true,
      llmProviderOrder: 'openai,deepseek,anthropic',
      llmWordsPerItem: 1,
      llmItemsPerRun: 15,
      llmMaxTotalGeneratedItems: 12,
      llmMaxPoolPerDialect: 50,
      llmBackfillItemsPerDialectPerRun: 10,
    });
    prisma.word.count.mockResolvedValue(10);

    await service.run();

    const promptArg = (service as any).chain.generateStructured.mock.calls[0][0] as string;
    expect(promptArg).toContain('exactly 2 distinct items');
  });

  it('skips single-word generation when singleWordGenerationEnabled is false, without touching llmWordsPerItem', async () => {
    const { service, prisma } = setupRun();
    prisma.platformSettings.upsert.mockResolvedValue({
      llmGenerationEnabled: true,
      singleWordGenerationEnabled: false,
      llmProviderOrder: 'openai,deepseek,anthropic',
      llmWordsPerItem: 1,
      llmItemsPerRun: 15,
      llmMaxTotalGeneratedItems: 5000,
      llmMaxPoolPerDialect: 50,
      llmBackfillItemsPerDialectPerRun: 10,
    });

    await service.run();

    expect((service as any).chain.generateStructured).not.toHaveBeenCalled();
  });

  it('still runs single-word generation when singleWordGenerationEnabled is true and llmWordsPerItem is 1', async () => {
    const { service, prisma } = setupRun();
    prisma.platformSettings.upsert.mockResolvedValue({
      llmGenerationEnabled: true,
      singleWordGenerationEnabled: true,
      llmProviderOrder: 'openai,deepseek,anthropic',
      llmWordsPerItem: 1,
      llmItemsPerRun: 15,
      llmMaxTotalGeneratedItems: 5000,
      llmMaxPoolPerDialect: 50,
      llmBackfillItemsPerDialectPerRun: 10,
    });

    await service.run();

    expect((service as any).chain.generateStructured).toHaveBeenCalled();
  });

  it('runs phrase-tier generation even when the main pass is skipped by the global cap', async () => {
    const { service, prisma } = setupRun();
    prisma.platformSettings.upsert.mockResolvedValue({
      llmGenerationEnabled: true,
      singleWordGenerationEnabled: true,
      llmProviderOrder: 'openai,deepseek,anthropic',
      llmWordsPerItem: 1,
      llmItemsPerRun: 15,
      llmMaxTotalGeneratedItems: 100,
      llmMaxPoolPerDialect: 50,
      llmBackfillItemsPerDialectPerRun: 10,
      phraseTierGenerationEnabled: true,
      phraseTierItemsPerTierPerRun: 3,
    });
    prisma.word.count.mockResolvedValue(100);
    prisma.word.findMany.mockResolvedValue([]);

    const runPhraseTierGenerationSpy = jest.spyOn(service as any, 'runPhraseTierGeneration');

    await service.run();

    expect(runPhraseTierGenerationSpy).toHaveBeenCalled();
    expect((service as any).chain.generateStructured).not.toHaveBeenCalled();
  });
});
