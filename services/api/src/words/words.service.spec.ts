import { WordsService } from './words.service';

describe('WordsService', () => {
  const trainer = { id: 'trainer-1', dialect: { tag: 'ig', name: 'Igbo' } };
  const session = { id: 'session-1', userId: trainer.id, endedAt: null };
  const settings = { isReverseWordTrainingEnabled: jest.fn() };
  const storage = { createPresignedUploadUrl: jest.fn() };
  let prisma: any;
  let service: WordsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(trainer) },
      trainingSession: { findUnique: jest.fn().mockResolvedValue(session) },
      word: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'word-1', text: 'welcome' }]),
      },
      wordRecording: { count: jest.fn(), findMany: jest.fn() },
      wordTrainingAssignment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    settings.isReverseWordTrainingEnabled.mockReset();
    service = new WordsService(prisma, storage as any, settings as any);
  });

  it('only issues English-to-dialect assignments when reverse training is disabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    prisma.wordTrainingAssignment.create.mockResolvedValue({ id: 'assignment-1', direction: 'ENGLISH_TO_DIALECT' });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toEqual({
      assignmentId: 'assignment-1',
      direction: 'ENGLISH_TO_DIALECT',
      promptText: 'welcome',
      sourceLanguage: 'English',
      responseLanguage: 'Igbo',
    });
    expect(prisma.wordRecording.count).not.toHaveBeenCalled();
  });

  it('uses another trainer submission for reverse validation when enabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(true);
    jest.spyOn(Math, 'random').mockReturnValue(0.75);
    prisma.wordRecording.count.mockResolvedValue(1);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: 'source-1', wordId: 'word-1', translationText: 'nnabata' }]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({ id: 'assignment-2', direction: 'DIALECT_TO_ENGLISH' });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
      direction: 'DIALECT_TO_ENGLISH',
      promptText: 'nnabata',
      sourceLanguage: 'Igbo',
      responseLanguage: 'English',
    });
    expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { not: trainer.id } }),
    }));
    jest.restoreAllMocks();
  });

  it('scores normalized reverse answers against the original English word', async () => {
    const assignment = {
      id: 'assignment-2',
      sessionId: session.id,
      wordId: 'word-1',
      direction: 'DIALECT_TO_ENGLISH',
      consumedAt: null,
      uploadBucket: 'recordings',
      uploadKey: 'ig/reverse/audio.webm',
      word: { text: 'Welcome!' },
      session: { userId: trainer.id, user: trainer },
    };
    prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback({
      wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wordRecording: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'recording-1',
          direction: data.direction,
          validationScore: { toNumber: () => data.validationScore },
        })),
      },
    }));

    await expect(service.createRecording(trainer.id, {
      assignmentId: assignment.id,
      responseText: '  WELCOME  ',
      bucket: assignment.uploadBucket,
      audioKey: assignment.uploadKey,
      durationMs: 1200,
      noiseRating: 'QUIET',
    })).resolves.toMatchObject({ validationScore: 1 });
  });
});
