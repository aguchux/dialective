import { DomainPromptGeneratorService } from './domain-prompt-generator.service';

describe('DomainPromptGeneratorService', () => {
  function setup(settingsOverrides: Record<string, unknown> = {}) {
    const settings = {
      domainConversationGenerationEnabled: true,
      domainConversationPromptsPerRun: 5,
      domainConversationMaxPromptPoolSize: 500,
      domainConversationProviderOrder: 'openai,deepseek,anthropic',
      ...settingsOverrides,
    };
    const prisma: any = {
      platformSettings: { upsert: jest.fn().mockResolvedValue(settings) },
      domainPrompt: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const service = new DomainPromptGeneratorService(prisma as never);
    return { service, prisma };
  }

  it('no-ops when domainConversationGenerationEnabled is false', async () => {
    const { service, prisma } = setup({ domainConversationGenerationEnabled: false });
    (service as any).chain = { generateStructured: jest.fn() };

    await service.run();

    expect((service as any).chain.generateStructured).not.toHaveBeenCalled();
    expect(prisma.domainPrompt.createMany).not.toHaveBeenCalled();
  });

  it('no-ops when the pool cap has already been reached', async () => {
    const { service, prisma } = setup({ domainConversationMaxPromptPoolSize: 10 });
    prisma.domainPrompt.count.mockResolvedValue(10);
    (service as any).chain = { generateStructured: jest.fn() };

    await service.run();

    expect((service as any).chain.generateStructured).not.toHaveBeenCalled();
  });

  it('inserts 3 rows (NEUTRAL/MALE/FEMALE) per accepted scenario', async () => {
    const { service, prisma } = setup();
    (service as any).chain = {
      generateStructured: jest.fn().mockResolvedValue({
        items: [
          {
            domain: 'Market',
            scenarioKey: 'market-buy-rice',
            neutralText: 'As a market vendor, buying rice, record a conversation.',
            maleText: 'As a market man, buying rice, record a conversation.',
            femaleText: 'As a market woman, buying rice, record a conversation.',
          },
        ],
        provider: 'openai',
      }),
    };

    await service.run();

    expect(prisma.domainPrompt.createMany).toHaveBeenCalledTimes(1);
    const inserted = prisma.domainPrompt.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(3);
    expect(inserted.map((row: { genderVariant: string }) => row.genderVariant).sort()).toEqual([
      'FEMALE',
      'MALE',
      'NEUTRAL',
    ]);
    expect(inserted.every((row: { scenarioKey: string }) => row.scenarioKey === 'market-buy-rice')).toBe(
      true,
    );
    expect(inserted.every((row: { source: string }) => row.source === 'llm')).toBe(true);
  });

  it('skips a scenario whose scenarioKey already exists (dedup)', async () => {
    const { service, prisma } = setup();
    prisma.domainPrompt.findFirst.mockResolvedValue({ id: 'existing-1' });
    (service as any).chain = {
      generateStructured: jest.fn().mockResolvedValue({
        items: [
          {
            domain: 'Market',
            scenarioKey: 'market-buy-rice',
            neutralText: 'a',
            maleText: 'b',
            femaleText: 'c',
          },
        ],
        provider: 'openai',
      }),
    };

    await service.run();

    expect(prisma.domainPrompt.createMany).not.toHaveBeenCalled();
  });

  it('skips a scenario with flagged content in any variant', async () => {
    const { service, prisma } = setup();
    (service as any).chain = {
      generateStructured: jest.fn().mockResolvedValue({
        items: [
          {
            domain: 'Market',
            scenarioKey: 'market-scenario',
            neutralText: 'a clean sentence',
            maleText: 'another clean sentence',
            femaleText: 'shit this is flagged',
          },
        ],
        provider: 'openai',
      }),
    };

    await service.run();

    expect(prisma.domainPrompt.createMany).not.toHaveBeenCalled();
  });

  it('caps the requested scenario count to the remaining row headroom (3 rows per scenario)', async () => {
    const { service, prisma } = setup({
      domainConversationMaxPromptPoolSize: 12,
      domainConversationPromptsPerRun: 10,
    });
    prisma.domainPrompt.count.mockResolvedValue(9); // headroom = 3 rows = 1 scenario
    const generateStructured = jest.fn().mockResolvedValue({ items: [], provider: 'openai' });
    (service as any).chain = { generateStructured };

    await service.run();

    const promptArg = generateStructured.mock.calls[0][0] as string;
    expect(promptArg).toContain('Generate 1 DISTINCT');
  });
});
