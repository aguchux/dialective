import { PromptsController } from './prompts.controller';

// Dictation prompt source text is always English regardless of the
// trainer's dialect -- the trainer reads/records it in their own dialect
// from their own fluency (see WordsService's ENGLISH_TO_DIALECT pattern).
// getNext must still return the trainer's REAL dialect in its response
// (used downstream for routing/upload-key/Submission.dialectTag), even
// though the Prompt row itself is always queried by en-us.
describe('PromptsController.getNext', () => {
  function setup(promptRow: { id: string; text: string }) {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dialect: { tag: 'yo-ng', active: true },
          dialectVariant: null,
        }),
      },
      prompt: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([promptRow]),
      },
    };
    const platformSettings: any = {
      getDictationMaxRecordingSeconds: jest.fn().mockResolvedValue(30),
    };
    const controller = new PromptsController(prisma, platformSettings);
    return { controller, prisma };
  }

  it('queries the Prompt pool by en-us, but returns the trainer own dialectTag', async () => {
    const { controller, prisma } = setup({ id: 'prompt-1', text: 'Hello there.' });

    const result = await controller.getNext({ user: { sub: 'user-1' } } as any);

    expect(prisma.prompt.count).toHaveBeenCalledWith({
      where: { dialectTag: 'en-us', active: true },
    });
    expect(prisma.prompt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dialectTag: 'en-us', active: true } }),
    );
    expect(result.dialectTag).toBe('yo-ng');
    expect(result.text).toBe('Hello there.');
  });
});

// getRandom is the unauthenticated landing-page ASR smoke-test route --
// deliberately query-param-driven, must stay unaffected by the always-
// English dictation fix.
describe('PromptsController.getRandom', () => {
  function setup(promptRow: { id: string; text: string }) {
    const prisma: any = {
      prompt: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([promptRow]),
      },
    };
    const platformSettings: any = {};
    const controller = new PromptsController(prisma, platformSettings);
    return { controller, prisma };
  }

  it('defaults to en-us when no dialectTag query param is given', async () => {
    const { controller, prisma } = setup({ id: 'prompt-1', text: 'Hello there.' });

    await controller.getRandom(undefined);

    expect(prisma.prompt.count).toHaveBeenCalledWith({ where: { dialectTag: 'en-us', active: true } });
  });

  it('respects an explicit dialectTag query param', async () => {
    const { controller, prisma } = setup({ id: 'prompt-1', text: 'Bonjour.' });

    await controller.getRandom('fr-rw');

    expect(prisma.prompt.count).toHaveBeenCalledWith({ where: { dialectTag: 'fr-rw', active: true } });
  });
});
