import { WordsService } from './words.service';

describe('WordsService', () => {
  const trainer = {
    id: 'trainer-1',
    dialect: { tag: 'ig', name: 'Igbo', keyboardLayout: null },
    dialectVariantId: 'variant-1',
    dialectVariant: { id: 'variant-1', active: true },
  };
  const session = {
    id: 'session-1',
    userId: trainer.id,
    endedAt: null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    lastQracAt: null as Date | null,
  };
  const settings = {
    getTaskTokenCost: jest.fn(),
    isReverseWordTrainingEnabled: jest.fn(),
    isPhraseEscalationEnabled: jest.fn(),
    isWordTrainingEnabled: jest.fn(),
    isSentenceTrainingEnabled: jest.fn(),
    isSpellingNormalizationEnabled: jest.fn().mockResolvedValue(false),
    getSpellingNormalizationProviderOrder: jest.fn().mockResolvedValue('openai,deepseek,anthropic'),
    getWordTrainingRecordingTimeoutSeconds: jest.fn().mockResolvedValue(5),
    getWordTrainingRecordingMaxTimeoutSeconds: jest.fn().mockResolvedValue(180),
    getAuditHoldEveryNSubmissions: jest.fn().mockResolvedValue(0),
    isQracEnabled: jest.fn().mockResolvedValue(false),
    isQracRequiredAtSessionStart: jest.fn().mockResolvedValue(false),
    getQracIntervalMinutes: jest.fn().mockResolvedValue(30),
  };
  const storage = { createPresignedDownloadUrl: jest.fn(), createPresignedUploadUrl: jest.fn() };
  const streams = { publish: jest.fn() };
  const llm = { normalize: jest.fn() };
  const courses = { getIncompleteRequiredCourses: jest.fn().mockResolvedValue([]) };
  const asrRegistry = {
    resolve: jest.fn().mockReturnValue({ engine: 'vosk', stream: 'asr-jobs-vosk' }),
  };
  const mail = { sendAuditHoldStartedEmail: jest.fn().mockResolvedValue(undefined) };
  let prisma: any;
  let service: WordsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(trainer) },
      trainingSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        create: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue(session),
      },
      qracAffirmationSubmission: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      word: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'word-1', text: 'welcome' }]),
      },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1', balance: { lt: () => false } }),
      },
      wordRecording: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      wordTrainingAssignment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      wordSkip: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      sentence: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(),
    };
    settings.getTaskTokenCost.mockResolvedValue(1);
    settings.isReverseWordTrainingEnabled.mockReset();
    settings.isPhraseEscalationEnabled.mockReset().mockResolvedValue(false);
    settings.isWordTrainingEnabled.mockReset().mockResolvedValue(true);
    settings.isSentenceTrainingEnabled.mockReset().mockResolvedValue(true);
    settings.isSpellingNormalizationEnabled.mockResolvedValue(false);
    courses.getIncompleteRequiredCourses.mockReset().mockResolvedValue([]);
    settings.getAuditHoldEveryNSubmissions.mockReset().mockResolvedValue(0);
    settings.isQracEnabled.mockReset().mockResolvedValue(false);
    settings.isQracRequiredAtSessionStart.mockReset().mockResolvedValue(false);
    settings.getQracIntervalMinutes.mockReset().mockResolvedValue(30);
    session.lastQracAt = null;
    mail.sendAuditHoldStartedEmail.mockReset().mockResolvedValue(undefined);
    service = new WordsService(
      prisma,
      storage as any,
      settings as any,
      streams as any,
      llm as any,
      courses as any,
      asrRegistry as any,
      mail as any,
    );
  });

  describe('startSession', () => {
    it('starts a session when there are no incomplete required courses', async () => {
      const result = await service.startSession(trainer.id);
      expect(result.sessionId).toBe(session.id);
      expect(prisma.trainingSession.create).toHaveBeenCalled();
    });

    it('blocks the session and never creates one when a required course is incomplete', async () => {
      courses.getIncompleteRequiredCourses.mockResolvedValue([
        { id: 'c1', slug: 'safety', title: 'Safety' },
      ]);
      await expect(service.startSession(trainer.id)).rejects.toThrow(
        'Complete the required course',
      );
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    });

    it('blocks the session when the trainer is on an active audit hold', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        auditHoldAt: new Date('2026-01-01'),
        auditHoldReleasedAt: null,
      });
      await expect(service.startSession(trainer.id)).rejects.toThrow('temporarily on hold');
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    });

    it('allows the session once a hold has been released after it was set', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          auditHoldAt: new Date('2026-01-01'),
          auditHoldReleasedAt: new Date('2026-01-02'),
        })
        .mockResolvedValueOnce(trainer);
      const result = await service.startSession(trainer.id);
      expect(result.sessionId).toBe(session.id);
    });

    it('blocks the session when the trainer has a dialect but no subdialect selected', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ auditHoldAt: null, auditHoldReleasedAt: null })
        .mockResolvedValueOnce({ ...trainer, dialectVariantId: null, dialectVariant: null });
      await expect(service.startSession(trainer.id)).rejects.toThrow(
        'Complete dialect onboarding before training',
      );
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    });
  });

  describe('audit hold threshold (checkAuditHoldThreshold via createRecording)', () => {
    const assignment = {
      id: 'assignment-1',
      consumedAt: null,
      direction: 'DIALECT_TO_ENGLISH',
      uploadBucket: 'b',
      uploadKey: 'k',
      word: { text: 'welcome' },
      wordId: 'word-1',
      sourceRecordingId: null,
      session: { id: session.id, userId: trainer.id, user: trainer },
    };
    const recordingBody = {
      bucket: 'b',
      audioKey: 'k',
      responseText: 'welcome',
      durationMs: 1000,
      noiseRating: 'QUIET',
    };

    beforeEach(() => {
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
      prisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wordRecording: {
            create: jest.fn().mockResolvedValue({
              id: 'recording-1',
              direction: 'DIALECT_TO_ENGLISH',
              validationScore: { toNumber: () => 1 },
            }),
          },
          ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findUnique.mockResolvedValue(null); // no sourceRecordingId here -> insertRedoRecording no-ops
      prisma.user.update = jest.fn().mockResolvedValue({ email: 'trainer@example.com' });
    });

    it('does nothing when the feature is disabled (everyN=0)', async () => {
      settings.getAuditHoldEveryNSubmissions.mockResolvedValue(0);
      prisma.wordRecording.count.mockResolvedValue(500);
      await service.createRecording(trainer.id, recordingBody as any);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mail.sendAuditHoldStartedEmail).not.toHaveBeenCalled();
    });

    it('does nothing when the count is not a multiple of the threshold', async () => {
      settings.getAuditHoldEveryNSubmissions.mockResolvedValue(500);
      prisma.wordRecording.count.mockResolvedValue(499);
      await service.createRecording(trainer.id, recordingBody as any);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sets the hold and emails the trainer when the count crosses a multiple of the threshold', async () => {
      settings.getAuditHoldEveryNSubmissions.mockResolvedValue(500);
      prisma.wordRecording.count.mockResolvedValue(500);
      await service.createRecording(trainer.id, recordingBody as any);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: trainer.id },
          data: { auditHoldAt: expect.any(Date) },
        }),
      );
      expect(mail.sendAuditHoldStartedEmail).toHaveBeenCalledWith({
        trainerEmail: 'trainer@example.com',
        submissionCount: 500,
      });
    });

    it('re-triggers at the next multiple (1000) without needing a separate since-release counter', async () => {
      settings.getAuditHoldEveryNSubmissions.mockResolvedValue(500);
      prisma.wordRecording.count.mockResolvedValue(1000);
      await service.createRecording(trainer.id, recordingBody as any);
      expect(mail.sendAuditHoldStartedEmail).toHaveBeenCalledWith({
        trainerEmail: 'trainer@example.com',
        submissionCount: 1000,
      });
    });

    it('does not fail the request if the notification email throws', async () => {
      settings.getAuditHoldEveryNSubmissions.mockResolvedValue(500);
      prisma.wordRecording.count.mockResolvedValue(500);
      mail.sendAuditHoldStartedEmail.mockRejectedValue(new Error('resend down'));
      await expect(
        service.createRecording(trainer.id, recordingBody as any),
      ).resolves.toMatchObject({ recordingId: 'recording-1' });
    });
  });

  it('only issues English-to-dialect assignments when reverse training is disabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    prisma.wordTrainingAssignment.create.mockResolvedValue({
      id: 'assignment-1',
      direction: 'ENGLISH_TO_DIALECT',
    });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toEqual({
      assignmentId: 'assignment-1',
      wordId: 'word-1',
      direction: 'ENGLISH_TO_DIALECT',
      promptText: 'welcome',
      sourceLanguage: 'English',
      responseLanguage: 'Igbo',
      dialectTag: 'ig',
      dialectKeyboardLayout: null,
      phraseTierJustReached: false,
    });
    expect(prisma.wordRecording.count).not.toHaveBeenCalled();
  });

  it('blocks a new assignment when the trainer cannot cover its cost', async () => {
    prisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1', balance: { lt: () => true } });

    await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow('Insufficient balance');
    expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
  });

  it('blocks nextAssignment when a required course becomes incomplete mid-session', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    courses.getIncompleteRequiredCourses.mockResolvedValue([
      { id: 'c1', slug: 'safety', title: 'Safety' },
    ]);

    await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow(
      'Complete the required course',
    );
    expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
  });

  describe('QRAC gate in nextAssignment', () => {
    beforeEach(() => {
      settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-1',
        direction: 'ENGLISH_TO_DIALECT',
      });
    });

    it('never blocks when qracEnabled is false, regardless of elapsed time', async () => {
      settings.isQracEnabled.mockResolvedValue(false);
      session.startedAt = new Date(Date.now() - 60 * 60_000);
      await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
        assignmentId: 'assignment-1',
      });
    });

    it('does not block a fresh session before the interval has elapsed', async () => {
      settings.isQracEnabled.mockResolvedValue(true);
      settings.isQracRequiredAtSessionStart.mockResolvedValue(false);
      settings.getQracIntervalMinutes.mockResolvedValue(30);
      session.startedAt = new Date(); // just started
      await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
        assignmentId: 'assignment-1',
      });
    });

    it('blocks with qracRequired once the interval has elapsed since startedAt', async () => {
      settings.isQracEnabled.mockResolvedValue(true);
      settings.isQracRequiredAtSessionStart.mockResolvedValue(false);
      settings.getQracIntervalMinutes.mockResolvedValue(30);
      session.startedAt = new Date(Date.now() - 31 * 60_000);
      session.lastQracAt = null;

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toMatchObject({
        response: expect.objectContaining({
          qracRequired: true,
          qracChecklist: expect.arrayContaining([expect.any(String)]),
        }),
      });
      expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
    });

    it('measures elapsed time from lastQracAt, not startedAt, once the trainer has signed before', async () => {
      settings.isQracEnabled.mockResolvedValue(true);
      settings.isQracRequiredAtSessionStart.mockResolvedValue(false);
      settings.getQracIntervalMinutes.mockResolvedValue(30);
      session.startedAt = new Date(Date.now() - 120 * 60_000); // session opened long ago
      session.lastQracAt = new Date(Date.now() - 5 * 60_000); // but signed recently

      await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
        assignmentId: 'assignment-1',
      });
    });

    it('requires QRAC before the first assignment of every new session when session-start mode is enabled', async () => {
      settings.isQracEnabled.mockResolvedValue(true);
      settings.isQracRequiredAtSessionStart.mockResolvedValue(true);
      session.startedAt = new Date();
      session.lastQracAt = null;

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toMatchObject({
        response: expect.objectContaining({ qracRequired: true }),
      });
      expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
    });

    it('allows subsequent assignments in session-start mode after QRAC is signed', async () => {
      settings.isQracEnabled.mockResolvedValue(true);
      settings.isQracRequiredAtSessionStart.mockResolvedValue(true);
      session.startedAt = new Date(Date.now() - 60 * 60_000);
      session.lastQracAt = new Date(Date.now() - 60 * 60_000);

      await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
        assignmentId: 'assignment-1',
      });
    });
  });

  it('excludes words the trainer has already recorded when picking an ENGLISH_TO_DIALECT word', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    prisma.word.count
      .mockResolvedValueOnce(3) // totalWords
      .mockResolvedValueOnce(1); // unattemptedCount, after excluding word-1/word-2
    prisma.wordRecording.findMany.mockResolvedValue([{ wordId: 'word-1' }, { wordId: 'word-2' }]);
    prisma.word.findMany.mockResolvedValue([{ id: 'word-3', text: 'river' }]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({
      id: 'assignment-3',
      direction: 'ENGLISH_TO_DIALECT',
    });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
      wordId: 'word-3',
      promptText: 'river',
    });
    expect(prisma.word.count).toHaveBeenNthCalledWith(2, {
      where: { id: { notIn: ['word-1', 'word-2'] }, isDisabled: false },
    });
    expect(prisma.word.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { notIn: ['word-1', 'word-2'] }, isDisabled: false },
      }),
    );
  });

  it('cycles back over the full word bank once the trainer has attempted every word', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    prisma.word.count
      .mockResolvedValueOnce(2) // totalWords
      .mockResolvedValueOnce(0) // unattemptedCount -- trainer has done both
      .mockResolvedValueOnce(1); // cycleCount -- full bank minus last-assigned
    prisma.wordRecording.findMany.mockResolvedValue([{ wordId: 'word-1' }, { wordId: 'word-2' }]);
    prisma.wordTrainingAssignment.findFirst.mockResolvedValue({ wordId: 'word-1' });
    prisma.word.findMany.mockResolvedValue([{ id: 'word-2', text: 'river' }]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({
      id: 'assignment-cycle',
      direction: 'ENGLISH_TO_DIALECT',
    });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
      wordId: 'word-2',
      promptText: 'river',
    });
    expect(prisma.word.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { notIn: ['word-1'] }, isDisabled: false } }),
    );
  });

  it('reports NO_WORDS_AVAILABLE only once cycling itself also has nothing to serve', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    prisma.word.count
      .mockResolvedValueOnce(1) // totalWords
      .mockResolvedValueOnce(0) // unattemptedCount
      .mockResolvedValueOnce(0); // cycleCount -- the single word IS the last-assigned one
    prisma.wordRecording.findMany.mockResolvedValue([{ wordId: 'word-1' }]);
    prisma.wordTrainingAssignment.findFirst.mockResolvedValue({ wordId: 'word-1' });

    await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow('NO_WORDS_AVAILABLE');
    expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
  });

  describe('word skip tracking', () => {
    beforeEach(() => {
      settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-next',
        direction: 'ENGLISH_TO_DIALECT',
      });
    });

    it('bumps the skip count when the trainer abandons an unconsumed ENGLISH_TO_DIALECT assignment', async () => {
      prisma.wordTrainingAssignment.findFirst.mockResolvedValue({
        id: 'assignment-prev',
        direction: 'ENGLISH_TO_DIALECT',
        wordId: 'word-1',
        consumedAt: null,
      });

      await service.nextAssignment(trainer.id, session.id);

      expect(prisma.wordSkip.upsert).toHaveBeenCalledWith({
        where: { userId_wordId: { userId: trainer.id, wordId: 'word-1' } },
        create: { userId: trainer.id, wordId: 'word-1', skipCount: 1 },
        update: { skipCount: { increment: 1 } },
      });
    });

    it('does not bump the skip count when the last assignment was already consumed', async () => {
      prisma.wordTrainingAssignment.findFirst.mockResolvedValue({
        id: 'assignment-prev',
        direction: 'ENGLISH_TO_DIALECT',
        wordId: 'word-1',
        consumedAt: new Date(),
      });

      await service.nextAssignment(trainer.id, session.id);

      expect(prisma.wordSkip.upsert).not.toHaveBeenCalled();
    });

    it('does not bump the skip count for a non-ENGLISH_TO_DIALECT last assignment', async () => {
      prisma.wordTrainingAssignment.findFirst.mockResolvedValue({
        id: 'assignment-prev',
        direction: 'DIALECT_TO_ENGLISH',
        wordId: null,
        consumedAt: null,
      });

      await service.nextAssignment(trainer.id, session.id);

      expect(prisma.wordSkip.upsert).not.toHaveBeenCalled();
    });

    it('keeps a banned word excluded even once cycling reopens the rest of the pool', async () => {
      prisma.word.count
        .mockResolvedValueOnce(2) // totalWords
        .mockResolvedValueOnce(0) // unattemptedCount -- trainer has attempted both
        .mockResolvedValueOnce(0); // cycleCount -- word-1 is last-assigned, word-2 is banned
      prisma.wordRecording.findMany.mockResolvedValue([{ wordId: 'word-1' }, { wordId: 'word-2' }]);
      prisma.wordSkip.findMany.mockResolvedValue([{ wordId: 'word-2' }]);
      prisma.wordTrainingAssignment.findFirst.mockResolvedValue({ wordId: 'word-1' });

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow(
        'NO_WORDS_AVAILABLE',
      );
      expect(prisma.word.findMany).not.toHaveBeenCalled();
    });

    it('reports NO_WORDS_AVAILABLE once every remaining word is banned', async () => {
      prisma.word.count
        .mockResolvedValueOnce(1) // totalWords
        .mockResolvedValueOnce(0) // unattemptedCount
        .mockResolvedValueOnce(0); // cycleCount -- the only word is banned
      prisma.wordRecording.findMany.mockResolvedValue([]);
      prisma.wordSkip.findMany.mockResolvedValue([{ wordId: 'word-1' }]);

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow(
        'NO_WORDS_AVAILABLE',
      );
      expect(prisma.wordTrainingAssignment.create).not.toHaveBeenCalled();
    });
  });

  it('uses another trainer submission for reverse validation when enabled', async () => {
    settings.isReverseWordTrainingEnabled.mockResolvedValue(true);
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    prisma.wordRecording.count.mockResolvedValue(1);
    prisma.wordRecording.findMany.mockResolvedValue([
      { id: 'source-1', wordId: 'word-1', sentenceId: null, translationText: 'nnabata' },
    ]);
    prisma.wordTrainingAssignment.create.mockResolvedValue({
      id: 'assignment-2',
      direction: 'DIALECT_TO_ENGLISH',
    });

    await expect(service.nextAssignment(trainer.id, session.id)).resolves.toMatchObject({
      direction: 'DIALECT_TO_ENGLISH',
      promptText: 'nnabata',
      sourceLanguage: 'Igbo',
      responseLanguage: 'English',
    });
    expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { not: trainer.id }, direction: 'ENGLISH_TO_DIALECT' }),
      }),
    );
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
      sourceRecordingId: null,
    };
    prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
    prisma.wordRecording.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
      callback({
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
      }),
    );

    await expect(
      service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        responseText: '  WELCOME  ',
        bucket: assignment.uploadBucket,
        audioKey: assignment.uploadKey,
        durationMs: 1200,
        noiseRating: 'QUIET',
      }),
    ).resolves.toMatchObject({ validationScore: 1 });
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

    await expect(
      service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        responseText: 'WELCOME',
        bucket: assignment.uploadBucket,
        audioKey: assignment.uploadKey,
        durationMs: 10001,
        noiseRating: 'QUIET',
      }),
    ).rejects.toThrow('Recording exceeds the 5s limit for this word');
  });

  describe('createRecording DIALECT_TO_ENGLISH redo-recording mechanic', () => {
    const sourceRecording = {
      id: 'source-1',
      translationText: 'nnabata',
    };
    const assignment = {
      id: 'assignment-redo',
      sessionId: session.id,
      wordId: 'word-1',
      sentenceId: null,
      direction: 'DIALECT_TO_ENGLISH',
      consumedAt: null,
      uploadBucket: 'recordings',
      uploadKey: 'ig/dialect_to_english/audio.webm',
      word: { text: 'welcome' },
      sourceRecordingId: sourceRecording.id,
      session: {
        id: session.id,
        userId: trainer.id,
        user: { ...trainer, dialectVariantId: null },
      },
    };

    beforeEach(() => {
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
      prisma.wordRecording.findUnique.mockResolvedValue(sourceRecording);
      prisma.wordRecording.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.wordRecording.create.mockResolvedValue({
        id: 'redo-recording-1',
        direction: 'ENGLISH_TO_DIALECT',
      });
      prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
        callback({
          ledgerEntry: { create: jest.fn() },
          wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wordRecording: {
            create: jest.fn().mockImplementation(({ data }) => ({
              id: 'recording-validation',
              direction: data.direction,
              validationScore: { toNumber: () => data.validationScore },
            })),
          },
        }),
      );
    });

    it('inserts a second PENDING ENGLISH_TO_DIALECT recording from the same audio, linked via redoOfRecordingId', async () => {
      await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        responseText: 'welcome',
        bucket: assignment.uploadBucket,
        audioKey: assignment.uploadKey,
        durationMs: 1200,
        noiseRating: 'QUIET',
      } as any);

      expect(prisma.wordRecording.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          wordId: 'word-1',
          sentenceId: null,
          direction: 'ENGLISH_TO_DIALECT',
          status: 'PENDING',
          translationText: sourceRecording.translationText,
          audioBucket: assignment.uploadBucket,
          audioKey: assignment.uploadKey,
          redoOfRecordingId: sourceRecording.id,
        }),
      });
    });

    it('publishes a quality-gate-jobs message for the new redo recording', async () => {
      await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        responseText: 'welcome',
        bucket: assignment.uploadBucket,
        audioKey: assignment.uploadKey,
        durationMs: 1200,
        noiseRating: 'QUIET',
      } as any);

      expect(streams.publish).toHaveBeenCalledWith(
        'quality-gate-jobs',
        expect.objectContaining({
          record_kind: 'word_recording',
          word_recording_id: 'redo-recording-1',
          expected_text: sourceRecording.translationText,
        }),
      );
    });

    it('does nothing extra when the source recording can no longer be found', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue(null);

      await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        responseText: 'welcome',
        bucket: assignment.uploadBucket,
        audioKey: assignment.uploadKey,
        durationMs: 1200,
        noiseRating: 'QUIET',
      } as any);

      expect(prisma.wordRecording.create).not.toHaveBeenCalled();
    });
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

      const result = await service.getSpellingSuggestions({
        wordId: 'word-1',
        dialectTag: 'ig',
      } as any);

      expect(result.suggestions).toEqual([
        { text: 'nnọọ', source: 'community' },
        { text: 'ndeewo', source: 'community' },
        { text: 'daalu', source: 'ai' },
      ]);
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            direction: 'ENGLISH_TO_DIALECT',
            status: 'SCORED',
            score: 100,
          }),
          orderBy: [{ compositeScore: { sort: 'desc', nulls: 'last' } }, { scoredAt: 'desc' }],
        }),
      );
    });

    it('skips the AI lookup entirely once community suggestions already fill all 8 slots', async () => {
      prisma.wordRecording.findMany.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({ translationText: `text-${i}` })),
      );
      prisma.wordTranslation = { findMany: jest.fn() };

      const result = await service.getSpellingSuggestions({
        wordId: 'word-1',
        dialectTag: 'ig',
      } as any);

      expect(result.suggestions).toHaveLength(8);
      expect(result.suggestions.every((s: any) => s.source === 'community')).toBe(true);
      expect(prisma.wordTranslation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('signQrac', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as any));
    });

    it('records the first signing as version 1.0 when the trainer has never signed', async () => {
      prisma.qracAffirmationSubmission.findFirst.mockResolvedValue(null);
      prisma.qracAffirmationSubmission.create.mockResolvedValue({});

      const result = await service.signQrac(trainer.id, session.id);

      expect(result.version).toBe('1.0');
      expect(prisma.qracAffirmationSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: trainer.id,
            sessionId: session.id,
            version: '1.0',
          }),
        }),
      );
      expect(prisma.trainingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: session.id },
          data: expect.objectContaining({ lastQracAt: result.signedAt }),
        }),
      );
    });

    it('increments the minor version off the trainer own most recent signing', async () => {
      prisma.qracAffirmationSubmission.findFirst.mockResolvedValue({ version: '1.4' });
      prisma.qracAffirmationSubmission.create.mockResolvedValue({});

      const result = await service.signQrac(trainer.id, session.id);

      expect(result.version).toBe('1.5');
    });

    it('rolls over to the next major version after .9', async () => {
      prisma.qracAffirmationSubmission.findFirst.mockResolvedValue({ version: '1.9' });
      prisma.qracAffirmationSubmission.create.mockResolvedValue({});

      const result = await service.signQrac(trainer.id, session.id);

      expect(result.version).toBe('2.0');
    });

    it('rejects signing an ended session', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue({ ...session, endedAt: new Date() });

      await expect(service.signQrac(trainer.id, session.id)).rejects.toThrow(
        'This training session has ended',
      );
      expect(prisma.qracAffirmationSubmission.create).not.toHaveBeenCalled();
    });

    it('rejects signing a session that does not belong to the caller', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue({ ...session, userId: 'someone-else' });

      await expect(service.signQrac(trainer.id, session.id)).rejects.toThrow(
        'does not belong to you',
      );
      expect(prisma.qracAffirmationSubmission.create).not.toHaveBeenCalled();
    });
  });

  describe('Sentence source (pickSentenceSource)', () => {
    beforeEach(() => {
      settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    });

    it('assigns a Word-sourced ENGLISH_TO_DIALECT when the roll favors words', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(true);
      settings.isSentenceTrainingEnabled.mockResolvedValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.9); // roll >= 1/2 -> word branch
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.direction).toBe('ENGLISH_TO_DIALECT');
      expect(result.wordId).toBe('word-1');
      expect(prisma.sentence.count).not.toHaveBeenCalled();
    });

    it('assigns a Sentence-sourced ENGLISH_TO_DIALECT when the roll favors sentences', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(true);
      settings.isSentenceTrainingEnabled.mockResolvedValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.1); // roll < 1/2 -> sentence branch
      prisma.sentence.count.mockResolvedValue(1);
      prisma.sentence.findMany.mockResolvedValue([{ id: 'sentence-1', text: 'good morning' }]);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-sentence-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result).toMatchObject({
        assignmentId: 'assignment-sentence-1',
        wordId: null,
        direction: 'ENGLISH_TO_DIALECT',
        promptText: 'good morning',
        sourceLanguage: 'English',
        responseLanguage: 'Igbo',
        dialectTag: 'ig',
      });
      expect(prisma.wordTrainingAssignment.create).toHaveBeenCalledWith({
        data: { sessionId: session.id, sentenceId: 'sentence-1', direction: 'ENGLISH_TO_DIALECT' },
      });
      expect(prisma.sentence.count).toHaveBeenCalledWith({
        where: { id: { notIn: [] }, isDisabled: false },
      });
    });

    it('never re-serves a sentence the trainer has already attempted', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(true);
      settings.isSentenceTrainingEnabled.mockResolvedValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
      prisma.wordRecording.findMany.mockResolvedValue([
        { sentenceId: 'sentence-1' },
        { sentenceId: 'sentence-2' },
      ]);
      prisma.sentence.count.mockResolvedValue(1); // only 1 sentence left unattempted
      prisma.sentence.findMany.mockResolvedValue([{ id: 'sentence-3', text: 'good evening' }]);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-sentence-unattempted',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.promptText).toBe('good evening');
      expect(prisma.sentence.count).toHaveBeenCalledWith({
        where: { id: { notIn: ['sentence-1', 'sentence-2'] }, isDisabled: false },
      });
      expect(prisma.sentence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { notIn: ['sentence-1', 'sentence-2'] }, isDisabled: false },
        }),
      );
    });

    it('falls back to a Word-sourced pick when the sentence pool is empty', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(true);
      settings.isSentenceTrainingEnabled.mockResolvedValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
      prisma.sentence.count.mockResolvedValue(0);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-fallback-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.direction).toBe('ENGLISH_TO_DIALECT');
      expect(result.wordId).toBe('word-1');
      expect(prisma.sentence.findMany).not.toHaveBeenCalled();
    });

    it('never serves sentences when sentenceTrainingEnabled is false, regardless of roll', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(true);
      settings.isSentenceTrainingEnabled.mockResolvedValue(false);
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-off-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.direction).toBe('ENGLISH_TO_DIALECT');
      expect(prisma.sentence.count).not.toHaveBeenCalled();
    });

    it('serves any Sentence, unfiltered, when wordTrainingEnabled is off', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(false);
      settings.isSentenceTrainingEnabled.mockResolvedValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.9); // roll would favor words, but words are off
      prisma.sentence.count.mockResolvedValue(1);
      prisma.sentence.findMany.mockResolvedValue([{ id: 'sentence-1', text: 'good morning' }]);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-sentence-only-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.promptText).toBe('good morning');
      expect(prisma.word.count).not.toHaveBeenCalled();
    });

    it('reverse-validation can source from a Sentence-sourced recording, carrying sentenceId not wordId', async () => {
      settings.isReverseWordTrainingEnabled.mockResolvedValue(true);
      settings.isPhraseEscalationEnabled.mockResolvedValue(false);
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
      prisma.wordRecording.count.mockResolvedValue(1);
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'source-sentence-1',
          wordId: null,
          sentenceId: 'sentence-1',
          translationText: 'ụtụtụ ọma',
        },
      ]);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-reverse-sentence-1',
        direction: 'DIALECT_TO_ENGLISH',
      });

      await service.nextAssignment(trainer.id, session.id);

      expect(prisma.wordTrainingAssignment.create).toHaveBeenCalledWith({
        data: {
          sessionId: session.id,
          wordId: null,
          sentenceId: 'sentence-1',
          direction: 'DIALECT_TO_ENGLISH',
          sourceRecordingId: 'source-sentence-1',
        },
      });
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ direction: 'ENGLISH_TO_DIALECT' }),
        }),
      );
      jest.restoreAllMocks();
    });

    it('createRecording scales the duration limit off promptText for a Sentence-sourced assignment', async () => {
      const assignment = {
        id: 'assignment-sentence-2',
        sessionId: session.id,
        wordId: null,
        sentenceId: 'sentence-1',
        direction: 'ENGLISH_TO_DIALECT',
        consumedAt: null,
        uploadBucket: 'recordings',
        uploadKey: 'ig/english_to_dialect/audio.webm',
        word: null,
        sentence: { text: 'good morning friend' }, // 3 words -> 3 x 5s = 15s allowed
        session: { userId: trainer.id, user: trainer },
      };
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);

      await expect(
        service.createRecording(trainer.id, {
          assignmentId: assignment.id,
          bucket: 'recordings',
          audioKey: 'ig/english_to_dialect/audio.webm',
          responseText: 'ụtụtụ ọma enyi',
          durationMs: 25_000,
          noiseRating: 'QUIET',
        } as any),
      ).rejects.toThrow('Recording exceeds the 15s limit for this word');
    });

    it('createRecording stores wordId=null, sentenceId=<x> for a Sentence-sourced recording', async () => {
      const assignment = {
        id: 'assignment-sentence-3',
        sessionId: session.id,
        wordId: null,
        sentenceId: 'sentence-1',
        direction: 'ENGLISH_TO_DIALECT',
        consumedAt: null,
        uploadBucket: 'recordings',
        uploadKey: 'ig/english_to_dialect/audio.webm',
        word: null,
        sentence: { text: 'good morning' },
        session: { id: session.id, userId: trainer.id, user: trainer },
      };
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
      const createRecordingMock = jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'recording-sentence-1', ...data }));
      prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
        callback({
          wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wordRecording: { create: createRecordingMock },
          ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        bucket: 'recordings',
        audioKey: 'ig/english_to_dialect/audio.webm',
        responseText: 'ụtụtụ ọma',
        durationMs: 5_000,
        noiseRating: 'QUIET',
      } as any);

      expect(createRecordingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ wordId: null, sentenceId: 'sentence-1' }),
        }),
      );
    });

    it('rejects a Word-sourced recording with no responseText (transcript stays required for words)', async () => {
      const assignment = {
        id: 'assignment-word-no-text',
        sessionId: session.id,
        wordId: 'word-1',
        sentenceId: null,
        direction: 'ENGLISH_TO_DIALECT',
        consumedAt: null,
        uploadBucket: 'recordings',
        uploadKey: 'ig/english_to_dialect/audio.webm',
        word: { text: 'hello' },
        sentence: null,
        session: { userId: trainer.id, user: trainer },
      };
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);

      await expect(
        service.createRecording(trainer.id, {
          assignmentId: assignment.id,
          bucket: 'recordings',
          audioKey: 'ig/english_to_dialect/audio.webm',
          durationMs: 5_000,
          noiseRating: 'QUIET',
        } as any),
      ).rejects.toThrow('responseText, bucket, audioKey, durationMs, and noiseRating are required');
    });

    it('accepts a Sentence-sourced ENGLISH_TO_DIALECT recording with no responseText, falling back translationText to the prompt text', async () => {
      const assignment = {
        id: 'assignment-sentence-no-text',
        sessionId: session.id,
        wordId: null,
        sentenceId: 'sentence-1',
        direction: 'ENGLISH_TO_DIALECT',
        consumedAt: null,
        uploadBucket: 'recordings',
        uploadKey: 'ig/english_to_dialect/audio.webm',
        word: null,
        sentence: { text: 'good morning friend' },
        session: { id: session.id, userId: trainer.id, user: trainer },
      };
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
      const createRecordingMock = jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'recording-sentence-no-text', ...data }));
      prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
        callback({
          wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wordRecording: { create: createRecordingMock },
          ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        bucket: 'recordings',
        audioKey: 'ig/english_to_dialect/audio.webm',
        durationMs: 10_000,
        noiseRating: 'QUIET',
      } as any);

      expect(createRecordingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translationText: 'good morning friend',
            validationScore: null,
            status: 'PENDING',
          }),
        }),
      );
    });

    it('accepts a Sentence-sourced DIALECT_TO_ENGLISH recording with no responseText and leaves validationScore null (no transcript to self-score against)', async () => {
      const assignment = {
        id: 'assignment-sentence-reverse-no-text',
        sessionId: session.id,
        wordId: null,
        sentenceId: 'sentence-1',
        direction: 'DIALECT_TO_ENGLISH',
        consumedAt: null,
        uploadBucket: 'recordings',
        uploadKey: 'ig/dialect_to_english/audio.webm',
        sourceRecordingId: null,
        word: null,
        sentence: { text: 'good morning friend' },
        session: { id: session.id, userId: trainer.id, user: trainer },
      };
      prisma.wordTrainingAssignment.findUnique.mockResolvedValue(assignment);
      const createRecordingMock = jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'recording-sentence-reverse-no-text', ...data }));
      prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
        callback({
          wordTrainingAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          wordRecording: { create: createRecordingMock },
          ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        bucket: 'recordings',
        audioKey: 'ig/dialect_to_english/audio.webm',
        durationMs: 10_000,
        noiseRating: 'QUIET',
      } as any);

      expect(createRecordingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ validationScore: null, status: 'PENDING' }),
        }),
      );
    });
  });

  describe('ASR-availability gate in nextAssignment', () => {
    afterEach(() => {
      asrRegistry.resolve.mockReset();
      asrRegistry.resolve.mockReturnValue({ engine: 'vosk', stream: 'asr-jobs-vosk' });
    });

    it('blocks with asrUnavailable when the trainer dialect has no asr-registry.yaml entry', async () => {
      asrRegistry.resolve.mockReturnValueOnce(undefined);

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toMatchObject({
        response: { asrUnavailable: true, dialectTag: 'ig' },
      });
    });

    it('does not block when the trainer dialect has a registered ASR entry', async () => {
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      await expect(service.nextAssignment(trainer.id, session.id)).resolves.toBeDefined();
    });

    it('does not block when the dialect has no ASR entry but asrGateBypassed is set (admin override)', async () => {
      asrRegistry.resolve.mockReturnValueOnce(undefined);
      prisma.user.findUnique
        .mockResolvedValueOnce(trainer) // assertNotOnAuditHold
        .mockResolvedValueOnce({
          ...trainer,
          dialect: { ...trainer.dialect, asrGateBypassed: true },
        }); // getTrainer
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      await expect(service.nextAssignment(trainer.id, session.id)).resolves.toBeDefined();
    });
  });

  describe('wordTrainingEnabled / sentenceTrainingEnabled content gates', () => {
    beforeEach(() => {
      settings.isReverseWordTrainingEnabled.mockResolvedValue(false);
    });

    it('never serves a Word when wordTrainingEnabled is false, even below every phrase tier', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(false);
      settings.isPhraseEscalationEnabled.mockResolvedValue(false);
      prisma.sentence.count.mockResolvedValue(1);
      prisma.sentence.findMany.mockResolvedValue([{ id: 'sentence-1', text: 'good morning' }]);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-sentence-only-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.wordId).toBeNull();
      expect(result.promptText).toBe('good morning');
      // Unfiltered pick (tier=null) -- no wordCount range in the query.
      expect(prisma.sentence.count).toHaveBeenCalledWith({
        where: { id: { notIn: [] }, isDisabled: false },
      });
      expect(prisma.word.count).not.toHaveBeenCalled();
    });

    it('throws NO_WORDS_AVAILABLE when wordTrainingEnabled is false and the sentence pool is empty', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(false);
      settings.isPhraseEscalationEnabled.mockResolvedValue(false);
      prisma.sentence.count.mockResolvedValue(0);

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow(
        'NO_WORDS_AVAILABLE',
      );
      expect(prisma.word.count).not.toHaveBeenCalled();
    });

    it('never serves a Sentence when sentenceTrainingEnabled is false, even when tiered', async () => {
      settings.isSentenceTrainingEnabled.mockResolvedValue(false);
      settings.isPhraseEscalationEnabled.mockResolvedValue(true);
      prisma.wordRecording.count.mockResolvedValue(150); // tier 1 -- would normally escalate
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-word-only-1',
        direction: 'ENGLISH_TO_DIALECT',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.wordId).toBe('word-1');
      expect(prisma.sentence.count).not.toHaveBeenCalled();
    });

    it('ALWAYS serves reverse-validation (ignoring the normal 1/3 roll) when both content gates are off and reverse is enabled', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(false);
      settings.isSentenceTrainingEnabled.mockResolvedValue(false);
      settings.isReverseWordTrainingEnabled.mockResolvedValue(true);
      // A roll that would normally fall OUTSIDE the 1/3 window, proving the
      // both-off case bypasses that check entirely.
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      prisma.wordRecording.count.mockResolvedValue(1);
      prisma.wordRecording.findMany.mockResolvedValue([
        { id: 'source-1', wordId: 'word-1', sentenceId: null, translationText: 'nnọọ' },
      ]);
      prisma.wordTrainingAssignment.create.mockResolvedValue({
        id: 'assignment-reverse-always-1',
        direction: 'DIALECT_TO_ENGLISH',
      });

      const result = await service.nextAssignment(trainer.id, session.id);

      expect(result.direction).toBe('DIALECT_TO_ENGLISH');
      expect(prisma.wordRecording.findMany).toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('throws NO_WORDS_AVAILABLE when all three gates (word/sentence/reverse) are off', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(false);
      settings.isSentenceTrainingEnabled.mockResolvedValue(false);
      settings.isReverseWordTrainingEnabled.mockResolvedValue(false);

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow(
        'NO_WORDS_AVAILABLE',
      );
      expect(prisma.wordRecording.findMany).not.toHaveBeenCalled();
      expect(prisma.word.count).not.toHaveBeenCalled();
    });

    it('falls through to NO_WORDS_AVAILABLE when both content gates are off, reverse is on, but the reverse pool is empty', async () => {
      settings.isWordTrainingEnabled.mockResolvedValue(false);
      settings.isSentenceTrainingEnabled.mockResolvedValue(false);
      settings.isReverseWordTrainingEnabled.mockResolvedValue(true);
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.sentence.count.mockResolvedValue(0);

      await expect(service.nextAssignment(trainer.id, session.id)).rejects.toThrow(
        'NO_WORDS_AVAILABLE',
      );
    });
  });
});
