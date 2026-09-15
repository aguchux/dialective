import { BadRequestException, ConflictException } from '@nestjs/common';
import { WordValidationFlag } from '@dialectiva/db';
import { WordValidationService } from './word-validation.service';

describe('WordValidationService', () => {
  const trainer = {
    id: 'trainer-1',
    dialect: { id: 'dialect-1', tag: 'ig', name: 'Igbo', active: true, tasksPaused: false },
    dialectVariantId: 'variant-1',
    dialectVariant: { id: 'variant-1', tag: 'basic', active: true, tasksPaused: false },
  };
  const session = {
    id: 'session-1',
    userId: trainer.id,
    endedAt: null as Date | null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    lastQracAt: null as Date | null,
  };
  const candidateRecording = {
    id: 'recording-1',
    wordId: 'word-correct',
    audioBucket: 'bucket',
    audioKey: 'key',
    misplacedDialectAt: null as Date | null,
    wrongDialectFlagCount: 0,
  };
  const correctWord = { id: 'word-correct', text: 'house' };

  let prisma: any;
  let storage: any;
  let settings: any;
  let courses: any;
  let service: WordValidationService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(trainer) },
      trainingSession: { findUnique: jest.fn().mockResolvedValue(session) },
      wordRecording: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([candidateRecording]),
        findUnique: jest.fn().mockResolvedValue(candidateRecording),
        update: jest.fn().mockResolvedValue({ wrongDialectFlagCount: 1, misplacedDialectAt: null }),
        delete: jest.fn(),
      },
      word: {
        findUnique: jest.fn().mockResolvedValue(correctWord),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      wordValidation: {
        create: jest.fn().mockResolvedValue({ id: 'validation-1' }),
      },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        update: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      },
      ledgerEntry: { create: jest.fn() },
      dialect: { findFirst: jest.fn() },
      dialectVariant: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
    };
    storage = {
      createPresignedDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://download' }),
    };
    settings = {
      isQracEnabled: jest.fn().mockResolvedValue(false),
      isQracRequiredAtSessionStart: jest.fn().mockResolvedValue(false),
      getQracIntervalMinutes: jest.fn().mockResolvedValue(30),
      isDialectValidationTaskEnabled: jest.fn().mockResolvedValue(true),
      getDialectValidationPayoutTokens: jest.fn().mockResolvedValue(0),
      getMisplacedDialectFlagThreshold: jest.fn().mockResolvedValue(3),
    };
    courses = { getIncompleteRequiredCourses: jest.fn().mockResolvedValue([]) };
    service = new WordValidationService(prisma, storage as any, settings as any, courses as any);
  });

  describe('nextItem', () => {
    it('returns a candidate with word options and a presigned audio url', async () => {
      const result = await service.nextItem(trainer.id, session.id);
      expect(result.recordingId).toBe('recording-1');
      expect(result.audioUrl).toBe('https://download');
      expect(result.wordOptions.some((o) => o.id === 'word-correct')).toBe(true);
      expect(result.dialectTag).toBe('ig');
    });

    it('throws NO_VALIDATION_ITEMS_AVAILABLE when the task is disabled', async () => {
      settings.isDialectValidationTaskEnabled.mockResolvedValue(false);
      await expect(service.nextItem(trainer.id, session.id)).rejects.toThrow(
        'NO_VALIDATION_ITEMS_AVAILABLE',
      );
    });

    it('throws NO_VALIDATION_ITEMS_AVAILABLE when no candidate exists', async () => {
      prisma.wordRecording.count.mockResolvedValue(0);
      await expect(service.nextItem(trainer.id, session.id)).rejects.toThrow(
        'NO_VALIDATION_ITEMS_AVAILABLE',
      );
    });

    it('rejects when the dialect is paused', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...trainer,
        dialect: { ...trainer.dialect, tasksPaused: true },
      });
      await expect(service.nextItem(trainer.id, session.id)).rejects.toThrow(
        'Training tasks are temporarily paused',
      );
    });

    it('excludes the trainer\'s own recordings and already-validated ones via the where clause', async () => {
      await service.nextItem(trainer.id, session.id);
      expect(prisma.wordRecording.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dialectTag: 'ig',
            userId: { not: trainer.id },
            validations: { none: { validatorId: trainer.id } },
          }),
        }),
      );
    });

    it('only offers SCORED/SETTLED recordings -- an unscored one has nothing for a peer to check against', async () => {
      await service.nextItem(trainer.id, session.id);
      expect(prisma.wordRecording.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['SCORED', 'SETTLED'] } }),
        }),
      );
      expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['SCORED', 'SETTLED'] } }),
        }),
      );
    });
  });

  describe('submit', () => {
    it('rejects when neither a word pick nor a flag is given', async () => {
      await expect(
        service.submit(trainer.id, { recordingId: 'recording-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates exactly one WordValidation and computes isCorrectMatch', async () => {
      const result = await service.submit(trainer.id, {
        recordingId: 'recording-1',
        selectedWordId: 'word-correct',
      } as any);
      expect(prisma.wordValidation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recordingId: 'recording-1',
            validatorId: trainer.id,
            selectedWordId: 'word-correct',
            isCorrectMatch: true,
          }),
        }),
      );
      expect(result.validationId).toBe('validation-1');
    });

    it('surfaces a friendly conflict when the unique constraint is violated', async () => {
      prisma.wordValidation.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.submit(trainer.id, { recordingId: 'recording-1', selectedWordId: 'word-correct' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects submitting against a recording already in the misplaced-dialect queue', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({
        ...candidateRecording,
        misplacedDialectAt: new Date(),
      });
      await expect(
        service.submit(trainer.id, { recordingId: 'recording-1', selectedWordId: 'word-correct' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('moves the recording into the misplaced-dialect queue once the threshold is crossed', async () => {
      prisma.wordRecording.update.mockResolvedValueOnce({
        wrongDialectFlagCount: 3,
        misplacedDialectAt: null,
      });
      const result = await service.submit(trainer.id, {
        recordingId: 'recording-1',
        flags: [WordValidationFlag.WRONG_DIALECT],
      } as any);
      expect(prisma.wordRecording.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { wrongDialectFlagCount: { increment: 1 } } }),
      );
      expect(prisma.wordRecording.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { misplacedDialectAt: expect.any(Date) } }),
      );
      expect(result.misplaced).toBe(true);
    });

    it('does not move the recording when the flag count is still below threshold', async () => {
      prisma.wordRecording.update.mockResolvedValueOnce({
        wrongDialectFlagCount: 1,
        misplacedDialectAt: null,
      });
      const result = await service.submit(trainer.id, {
        recordingId: 'recording-1',
        flags: [WordValidationFlag.WRONG_DIALECT],
      } as any);
      expect(result.misplaced).toBe(false);
    });

    it('credits a wallet reward when the task is enabled and payout > 0', async () => {
      settings.getDialectValidationPayoutTokens.mockResolvedValue(0.5);
      const result = await service.submit(trainer.id, {
        recordingId: 'recording-1',
        selectedWordId: 'word-correct',
      } as any);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'VALIDATION_REWARD', amount: 0.5 }),
        }),
      );
      expect(result.rewarded).toBe(true);
      expect(result.rewardAmount).toBe('0.5');
    });

    it('does not credit a reward when payout is 0', async () => {
      const result = await service.submit(trainer.id, {
        recordingId: 'recording-1',
        selectedWordId: 'word-correct',
      } as any);
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
      expect(result.rewarded).toBe(false);
    });

    it('does not credit a reward when the task is disabled even if payout > 0', async () => {
      settings.isDialectValidationTaskEnabled.mockResolvedValue(false);
      settings.getDialectValidationPayoutTokens.mockResolvedValue(0.5);
      const result = await service.submit(trainer.id, {
        recordingId: 'recording-1',
        selectedWordId: 'word-correct',
      } as any);
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
      expect(result.rewarded).toBe(false);
    });
  });

  describe('resolveMisplacedDialectRecording', () => {
    const misplacedRecording = {
      id: 'recording-1',
      dialectTag: 'ig',
      misplacedDialectAt: new Date(),
    };

    it('deletes the recording when action is DELETE', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue(misplacedRecording);
      const result = await service.resolveMisplacedDialectRecording('recording-1', {
        action: 'DELETE',
      } as any);
      expect(prisma.wordRecording.delete).toHaveBeenCalledWith({ where: { id: 'recording-1' } });
      expect(result.status).toBe('deleted');
    });

    it('reassigns the dialect and clears the queue flag when action is REASSIGN', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue(misplacedRecording);
      prisma.dialect.findFirst.mockResolvedValue({ id: 'dialect-2', tag: 'yo' });
      const result = await service.resolveMisplacedDialectRecording('recording-1', {
        action: 'REASSIGN',
        dialectTag: 'yo',
      } as any);
      expect(prisma.wordRecording.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dialectTag: 'yo',
            misplacedDialectAt: null,
            wrongDialectFlagCount: 0,
          }),
        }),
      );
      expect(result.status).toBe('reassigned');
    });

    it('rejects resolving a recording that is not in the queue', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue({ ...misplacedRecording, misplacedDialectAt: null });
      await expect(
        service.resolveMisplacedDialectRecording('recording-1', { action: 'DELETE' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });
});
