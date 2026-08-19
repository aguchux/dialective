import { WordsService } from './words.service';

describe('WordsService', () => {
  const trainer = { id: 'trainer-1', dialect: { tag: 'ig', name: 'Igbo', keyboardLayout: null } };
  const session = { id: 'session-1', userId: trainer.id, endedAt: null };
  const settings = {
    getTaskTokenCost: jest.fn(),
    isReverseWordTrainingEnabled: jest.fn(),
    isSentenceRebuildEnabled: jest.fn(),
    isSpellingNormalizationEnabled: jest.fn().mockResolvedValue(false),
    getSpellingNormalizationProviderOrder: jest.fn().mockResolvedValue('openai,deepseek,anthropic'),
    getWordTrainingRecordingTimeoutSeconds: jest.fn().mockResolvedValue(5),
    getWordTrainingRecordingMaxTimeoutSeconds: jest.fn().mockResolvedValue(180),
  };
  const storage = { createPresignedDownloadUrl: jest.fn(), createPresignedUploadUrl: jest.fn() };
  const streams = { publish: jest.fn() };
  const llm = { normalize: jest.fn() };
  const courses = { getIncompleteRequiredCourses: jest.fn().mockResolvedValue([]) };
  let prisma: any;
  let service: WordsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(trainer) },
      trainingSession: { findUnique: jest.fn().mockResolvedValue(session), create: jest.fn().mockResolvedValue(session) },
      word: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'word-1', text: 'welcome' }]),
      },
      wallet: { upsert: jest.fn().mockResolvedValue({ id: 'wallet-1', balance: 10 }) },
      wordRecording: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      wordTrainingAssignment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      prompt: { findMany: jest.fn().mockResolvedValue([]) },
      promptWord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    settings.getTaskTokenCost.mockResolvedValue(1);
    settings.isReverseWordTrainingEnabled.mockReset();
    settings.isSentenceRebuildEnabled.mockReset().mockResolvedValue(false);
    settings.isSpellingNormalizationEnabled.mockResolvedValue(false);
    courses.getIncompleteRequiredCourses.mockReset().mockResolvedValue([]);
    service = new WordsService(prisma, storage as any, settings as any, streams as any, llm as any, courses as any);
  });

  describe('startSession', () => {
    it('starts a session when there are no incomplete required courses', async () => {
      const result = await service.startSession(trainer.id);
      expect(result.sessionId).toBe(session.id);
      expect(prisma.trainingSession.create).toHaveBeenCalled();
    });

    it('blocks the session and never creates one when a required course is incomplete', async () => {
      courses.getIncompleteRequiredCourses.mockResolvedValue([{ id: 'c1', slug: 'safety', title: 'Safety' }]);
      await expect(service.startSession(trainer.id)).rejects.toThrow('Complete the required course');
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    });
  });

  it('only issues English-to-dialect assignments when reverse training and sentence-rebuild are disabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    settings.isSentenceRebuildEnabled.mockResolvedValue(false);
    prisma.wordTrainingAssignment.create.mockResolvedValue({ id: 'assignment-1', direction: 'ENGLISH_TO_DIALECT' });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toEqual({
      assignmentId: 'assignment-1',
      wordId: 'word-1',
      direction: 'ENGLISH_TO_DIALECT',
      promptText: 'welcome',
      sourceLanguage: 'English',
      responseLanguage: 'Igbo',
      dialectTag: 'ig',
      dialectKeyboardLayout: null,
      fragments: null,
    });
    expect(prisma.wordRecording.count).not.toHaveBeenCalled();
  });

  it('blocks nextAssignment when a required course becomes incomplete mid-session', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    settings.isSentenceRebuildEnabled.mockResolvedValue(false);
    courses.getIncompleteRequiredCourses.mockResolvedValue([{ id: 'c1', slug: 'safety', title: 'Safety' }]);

    await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow('Complete the required course');
    expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
  });

  it('excludes words the trainer has already recorded when picking an ENGLISH_TO_DIALECT word', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    settings.isSentenceRebuildEnabled.mockResolvedValue(false);
    prisma.word.count
      .mockResolvedValueOnce(3) // totalWords
      .mockResolvedValueOnce(1); // unattemptedCount, after excluding word-1/word-2
    prisma.wordRecording.findMany.mockResolvedValue([{ wordId: 'word-1' }, { wordId: 'word-2' }]);
    prisma.word.findMany.mockResolvedValue([{ id: 'word-3', text: 'river' }]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({ id: 'assignment-3', direction: 'ENGLISH_TO_DIALECT' });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
      wordId: 'word-3',
      promptText: 'river',
    });
    expect(prisma.word.count).toHaveBeenNthCalledWith(2, { where: { id: { notIn: ['word-1', 'word-2'] } } });
    expect(prisma.word.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { notIn: ['word-1', 'word-2'] } },
    }));
  });

  it('widens back to the full word bank once the trainer has attempted every word', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    settings.isSentenceRebuildEnabled.mockResolvedValue(false);
    prisma.word.count
      .mockResolvedValueOnce(2) // totalWords
      .mockResolvedValueOnce(0); // unattemptedCount -- trainer has done both
    prisma.wordRecording.findMany.mockResolvedValue([{ wordId: 'word-1' }, { wordId: 'word-2' }]);
    prisma.word.findMany.mockResolvedValue([{ id: 'word-1', text: 'welcome' }]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({ id: 'assignment-4', direction: 'ENGLISH_TO_DIALECT' });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({ wordId: 'word-1' });
    expect(prisma.word.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('uses another trainer submission for reverse validation when enabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(true);
    settings.isSentenceRebuildEnabled.mockResolvedValue(false);
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
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
      ledgerEntry: { create: jest.fn() },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

  it('rejects a recording that exceeds the per-word timeout x word count, plus grace', async () => {
    settings.getWordTrainingRecordingTimeoutSeconds.mockResolvedValue(5);
    settings.getWordTrainingRecordingMaxTimeoutSeconds.mockResolvedValue(180);
    const assignment = {
      id: 'assignment-3',
      sessionId: session.id,
      wordId: 'word-1',
      direction: 'DIALECT_TO_ENGLISH',
      consumedAt: null,
      uploadBucket: 'recordings',
      uploadKey: 'ig/reverse/audio.webm',
      word: { text: 'Welcome!' }, // 1 word -> 5s allowed + 5s grace = 10000ms
      session: { userId: trainer.id, user: trainer },
    };
    prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);

    await expect(service.createRecording(trainer.id, {
      assignmentId: assignment.id,
      responseText: 'WELCOME',
      bucket: assignment.uploadBucket,
      audioKey: assignment.uploadKey,
      durationMs: 10001,
      noiseRating: 'QUIET',
    })).rejects.toThrow('Recording exceeds the 5s limit for this word');
  });

  it('picks a sentence-rebuild assignment and shuffles its fragments when enabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    settings.isSentenceRebuildEnabled.mockResolvedValue(true);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    prisma.prompt.findMany.mockResolvedValue([{ id: 'prompt-1' }]);
    prisma.promptWord.count.mockResolvedValue(3);
    prisma.promptWord.findMany.mockResolvedValue([
      { text: 'I' },
      { text: 'am' },
      { text: 'well' },
    ]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({ id: 'assignment-3', direction: 'SENTENCE_REBUILD' });

    const result = await service.nextAssignment(trainer.id, session.id);

    expect(result).toMatchObject({
      assignmentId: 'assignment-3',
      wordId: null,
      direction: 'SENTENCE_REBUILD',
      promptText: null,
      sourceLanguage: 'Igbo',
      responseLanguage: 'Igbo',
      dialectTag: 'ig',
    });
    expect(result.fragments).toHaveLength(3);
    expect(result.fragments!.map((f) => f.text).sort()).toEqual(['I', 'am', 'well']);
    expect(result.fragments!.map((f) => f.position).sort()).toEqual([0, 1, 2]);
    jest.restoreAllMocks();
  });

  it('scores an exact-order sentence-rebuild submission as 100', async () => {
    const assignment = {
      id: 'assignment-3',
      sessionId: session.id,
      wordId: null,
      promptId: 'prompt-1',
      direction: 'SENTENCE_REBUILD',
      consumedAt: null,
      word: null,
      prompt: {
        words: [
          { position: 0, dialectTag: 'ig', text: 'A' },
          { position: 1, dialectTag: 'ig', text: 'na' },
          { position: 2, dialectTag: 'ig', text: 'agba' },
        ],
      },
      session: { userId: trainer.id, user: trainer },
    };
    prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback({
      ledgerEntry: { create: jest.fn() },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wordRecording: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'recording-2',
          direction: data.direction,
          validationScore: { toNumber: () => data.validationScore },
        })),
      },
    }));

    await expect(service.createRecording(trainer.id, {
      assignmentId: assignment.id,
      submittedOrder: [0, 1, 2],
    })).resolves.toMatchObject({ validationScore: 1 });
  });

  it('scores a shuffled/wrong-order sentence-rebuild submission as 0', async () => {
    const assignment = {
      id: 'assignment-3',
      sessionId: session.id,
      wordId: null,
      promptId: 'prompt-1',
      direction: 'SENTENCE_REBUILD',
      consumedAt: null,
      word: null,
      prompt: {
        words: [
          { position: 0, dialectTag: 'ig', text: 'A' },
          { position: 1, dialectTag: 'ig', text: 'na' },
          { position: 2, dialectTag: 'ig', text: 'agba' },
        ],
      },
      session: { userId: trainer.id, user: trainer },
    };
    prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback({
      ledgerEntry: { create: jest.fn() },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wordRecording: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'recording-3',
          direction: data.direction,
          validationScore: { toNumber: () => data.validationScore },
        })),
      },
    }));

    await expect(service.createRecording(trainer.id, {
      assignmentId: assignment.id,
      submittedOrder: [2, 0, 1],
    })).resolves.toMatchObject({ validationScore: 0 });
  });

  describe('getSpellingSuggestions', () => {
    it('orders community (score:100) rows by compositeScore, filling remaining slots with AI translations', async () => {
      // The mocked findMany stands in for Prisma's own ORDER BY + client-side
      // distinct behavior -- returning rows already in the order a real
      // query (compositeScore desc nulls last, then scoredAt desc) would
      // produce, since we're unit-testing WordsService's assembly logic
      // here, not Prisma's query engine (verified separately).
      prisma.wordRecording.findMany.mockResolvedValue([
        { translationText: 'nnọọ' }, // highest compositeScore
        { translationText: 'ndeewo' }, // lower compositeScore
      ]);
      prisma.wordTranslation = { findMany: jest.fn().mockResolvedValue([{ text: 'daalu' }]) };

      const result = await service.getSpellingSuggestions({ wordId: 'word-1', dialectTag: 'ig' } as any);

      expect(result.suggestions).toEqual([
        { text: 'nnọọ', source: 'community' },
        { text: 'ndeewo', source: 'community' },
        { text: 'daalu', source: 'ai' },
      ]);
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ direction: 'ENGLISH_TO_DIALECT', status: 'SCORED', score: 100 }),
          orderBy: [{ compositeScore: { sort: 'desc', nulls: 'last' } }, { scoredAt: 'desc' }],
        }),
      );
    });

    it('skips the AI lookup entirely once community suggestions already fill all 8 slots', async () => {
      prisma.wordRecording.findMany.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({ translationText: `text-${i}` })),
      );
      prisma.wordTranslation = { findMany: jest.fn() };

      const result = await service.getSpellingSuggestions({ wordId: 'word-1', dialectTag: 'ig' } as any);

      expect(result.suggestions).toHaveLength(8);
      expect(result.suggestions.every((s: any) => s.source === 'community')).toBe(true);
      expect(prisma.wordTranslation.findMany).not.toHaveBeenCalled();
    });
  });
});
