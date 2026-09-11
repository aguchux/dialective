import { DomainConversationsService } from './domain-conversations.service';

describe('DomainConversationsService', () => {
  const trainer = {
    id: 'trainer-1',
    gender: null as 'MALE' | 'FEMALE' | null,
    dialect: { id: 'dialect-1', tag: 'ig', name: 'Igbo', active: true },
    dialectVariantId: 'variant-1',
    dialectVariant: { id: 'variant-1', tag: 'basic', active: true },
  };
  const session = {
    id: 'session-1',
    userId: trainer.id,
    endedAt: null as Date | null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    lastQracAt: null as Date | null,
  };
  const prompt = {
    id: 'prompt-1',
    scenarioKey: 'market-buy-rice',
    domain: 'Market',
    genderVariant: 'NEUTRAL',
    text: 'As a market vendor, buying a bag of rice, record a conversation.',
    isDisabled: false,
    lastServedAt: null as Date | null,
  };
  const assignment = {
    id: 'assignment-1',
    sessionId: session.id,
    promptId: prompt.id,
    uploadBucket: null as string | null,
    uploadKey: null as string | null,
    consumedAt: null as Date | null,
    prompt,
    session: { userId: trainer.id, user: trainer },
  };

  let prisma: any;
  let storage: any;
  let settings: any;
  let streams: any;
  let courses: any;
  let service: DomainConversationsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(trainer) },
      trainingSession: { findUnique: jest.fn().mockResolvedValue(session) },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1', balance: { lt: () => false } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      domainPrompt: {
        findFirst: jest.fn().mockResolvedValue(prompt),
        update: jest.fn().mockResolvedValue(prompt),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(45),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
      },
      domainConversationAssignment: {
        create: jest.fn().mockResolvedValue(assignment),
        update: jest.fn().mockResolvedValue(assignment),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(assignment),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      domainConversationRecording: {
        create: jest.fn().mockResolvedValue({ id: 'recording-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wordRecording: { count: jest.fn().mockResolvedValue(0) },
      ledgerEntry: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
    };
    storage = {
      createPresignedUploadUrl: jest.fn().mockResolvedValue({ url: 'https://upload', expiresInSeconds: 900 }),
    };
    settings = {
      isDomainConversationTaskEnabled: jest.fn().mockResolvedValue(true),
      getDomainConversationTaskTokenCost: jest.fn().mockResolvedValue(3),
      getDomainConversationMinDurationSeconds: jest.fn().mockResolvedValue(15),
      getDomainConversationMaxDurationSeconds: jest.fn().mockResolvedValue(60),
      getAuditHoldEveryNSubmissions: jest.fn().mockResolvedValue(0),
      isQracEnabled: jest.fn().mockResolvedValue(false),
      isQracRequiredAtSessionStart: jest.fn().mockResolvedValue(false),
      getQracIntervalMinutes: jest.fn().mockResolvedValue(30),
      getDomainConversationMaxCyclesPerTrainer: jest.fn().mockResolvedValue(2),
    };
    streams = { publish: jest.fn() };
    courses = { getIncompleteRequiredCourses: jest.fn().mockResolvedValue([]) };
    service = new DomainConversationsService(
      prisma,
      storage as any,
      settings as any,
      streams as any,
      courses as any,
    );
  });

  describe('nextPrompt', () => {
    it('returns a prompt with the admin-configured duration range', async () => {
      const result = await service.nextPrompt(trainer.id, session.id);
      expect(result).toMatchObject({
        assignmentId: assignment.id,
        promptId: prompt.id,
        domain: 'Market',
        promptText: prompt.text,
        dialectTag: 'ig',
        minDurationSeconds: 15,
        maxDurationSeconds: 60,
      });
    });

    it('picks the MALE variant for a MALE trainer when available', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...trainer, gender: 'MALE' });
      prisma.domainPrompt.findFirst.mockResolvedValueOnce({ ...prompt, genderVariant: 'MALE' });
      await service.nextPrompt(trainer.id, session.id);
      expect(prisma.domainPrompt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { genderVariant: 'MALE', isDisabled: false } }),
      );
    });

    it('falls back to NEUTRAL when the desired gender pool is empty', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...trainer, gender: 'FEMALE' });
      prisma.domainPrompt.findFirst
        .mockResolvedValueOnce(null) // FEMALE pool empty
        .mockResolvedValueOnce(prompt); // NEUTRAL fallback
      const result = await service.nextPrompt(trainer.id, session.id);
      expect(prisma.domainPrompt.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { genderVariant: 'FEMALE', isDisabled: false } }),
      );
      expect(prisma.domainPrompt.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { genderVariant: 'NEUTRAL', isDisabled: false } }),
      );
      expect(result.promptId).toBe(prompt.id);
    });

    it('bumps lastServedAt/timesServed on the picked prompt -- this IS the LRU mechanism', async () => {
      await service.nextPrompt(trainer.id, session.id);
      expect(prisma.domainPrompt.update).toHaveBeenCalledWith({
        where: { id: prompt.id },
        data: { lastServedAt: expect.any(Date), timesServed: { increment: 1 } },
      });
    });

    it('throws NO_DOMAIN_PROMPTS_AVAILABLE when the pool is empty entirely', async () => {
      prisma.domainPrompt.findFirst.mockResolvedValue(null);
      await expect(service.nextPrompt(trainer.id, session.id)).rejects.toThrow(
        'NO_DOMAIN_PROMPTS_AVAILABLE',
      );
    });

    it('throws NO_DOMAIN_PROMPTS_AVAILABLE when the task is admin-disabled', async () => {
      settings.isDomainConversationTaskEnabled.mockResolvedValue(false);
      await expect(service.nextPrompt(trainer.id, session.id)).rejects.toThrow(
        'NO_DOMAIN_PROMPTS_AVAILABLE',
      );
    });

    it('rejects with insufficient balance before picking a prompt', async () => {
      prisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1', balance: { lt: () => true } });
      await expect(service.nextPrompt(trainer.id, session.id)).rejects.toThrow('Insufficient balance');
      expect(prisma.domainPrompt.findFirst).not.toHaveBeenCalled();
    });

    // Regression: Prisma sorts nulls LAST by default on 'asc', unlike raw
    // Postgres (nulls-first for ASC) -- without an explicit nulls:'first'
    // override here, never-served prompts sort behind already-served ones
    // and the LRU rotation collapses onto whichever rows were served first.
    it('orders the pick query with never-served prompts (null lastServedAt) first', async () => {
      await service.nextPrompt(trainer.id, session.id);
      expect(prisma.domainPrompt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastServedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
        }),
      );
    });

    it('blocks with poolExhausted once a trainer has consumed maxCycles full passes through the pool', async () => {
      // pool size 45, maxCycles 2 -> blocked at 90 consumed assignments
      prisma.domainConversationAssignment.count.mockResolvedValue(90);
      await expect(service.nextPrompt(trainer.id, session.id)).rejects.toMatchObject({
        response: expect.objectContaining({ poolExhausted: true }),
      });
      expect(prisma.domainPrompt.findFirst).not.toHaveBeenCalled();
    });

    it('does not block a trainer under the maxCycles threshold', async () => {
      prisma.domainConversationAssignment.count.mockResolvedValue(89);
      await expect(service.nextPrompt(trainer.id, session.id)).resolves.toBeDefined();
    });

    it('never blocks on pool exhaustion when maxCycles is 0 (cap disabled)', async () => {
      settings.getDomainConversationMaxCyclesPerTrainer.mockResolvedValue(0);
      prisma.domainConversationAssignment.count.mockResolvedValue(999_999);
      await expect(service.nextPrompt(trainer.id, session.id)).resolves.toBeDefined();
    });
  });

  describe('createUploadUrl', () => {
    it('builds the storage key under {dialectTag}/domain-conversation/{domainSlug}/{assignmentId}/...', async () => {
      await service.createUploadUrl(trainer.id, {
        assignmentId: assignment.id,
        contentType: 'audio/webm',
      });
      const [, key] = storage.createPresignedUploadUrl.mock.calls[0];
      expect(key).toMatch(/^ig\/basic\/domain-conversation\/market\/assignment-1\/[a-f0-9-]+\.webm$/);
    });

    it('refuses to re-upload for an already-consumed assignment', async () => {
      prisma.domainConversationAssignment.findUnique.mockResolvedValue({
        ...assignment,
        consumedAt: new Date(),
      });
      await expect(
        service.createUploadUrl(trainer.id, { assignmentId: assignment.id, contentType: 'audio/webm' }),
      ).rejects.toThrow('already been submitted');
    });
  });

  describe('createRecording', () => {
    const uploadedAssignment = { ...assignment, uploadBucket: 'dialectiva-word-recordings', uploadKey: 'ig/domain-conversation/market/assignment-1/x.webm' };

    beforeEach(() => {
      prisma.domainConversationAssignment.findUnique.mockResolvedValue(uploadedAssignment);
    });

    it('rejects a recording shorter than the admin-configured minimum', async () => {
      await expect(
        service.createRecording(trainer.id, {
          assignmentId: assignment.id,
          bucket: uploadedAssignment.uploadBucket,
          audioKey: uploadedAssignment.uploadKey,
          durationMs: 10_000,
          noiseRating: 'QUIET',
        }),
      ).rejects.toThrow('must be at least 15s');
      expect(prisma.domainConversationRecording.create).not.toHaveBeenCalled();
    });

    it('rejects a recording past the admin-configured maximum plus grace', async () => {
      await expect(
        service.createRecording(trainer.id, {
          assignmentId: assignment.id,
          bucket: uploadedAssignment.uploadBucket,
          audioKey: uploadedAssignment.uploadKey,
          durationMs: 70_000,
          noiseRating: 'QUIET',
        }),
      ).rejects.toThrow('exceeds the 60s limit');
    });

    it('accepts a recording within range, locks the token cost, and publishes to quality-gate-jobs with no asr_stream/expected_text', async () => {
      const result = await service.createRecording(trainer.id, {
        assignmentId: assignment.id,
        bucket: uploadedAssignment.uploadBucket,
        audioKey: uploadedAssignment.uploadKey,
        durationMs: 30_000,
        noiseRating: 'QUIET',
      });

      expect(result).toEqual({ recordingId: 'recording-1', status: 'saved' });
      expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', balance: { gte: 3 } },
        data: { balance: { decrement: 3 }, lockedBalance: { increment: 3 } },
      });
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: { walletId: 'wallet-1', type: 'TASK_LOCK', amount: -3, reference: 'recording-1' },
      });

      const publishedPayload = streams.publish.mock.calls[0][1];
      expect(publishedPayload).toMatchObject({
        record_kind: 'domain_conversation_recording',
        word_recording_id: 'recording-1',
        dialect_tag: 'ig',
      });
      expect(publishedPayload).not.toHaveProperty('asr_stream');
      expect(publishedPayload).not.toHaveProperty('expected_text');
    });

    it('refuses to submit when the upload does not belong to this assignment', async () => {
      await expect(
        service.createRecording(trainer.id, {
          assignmentId: assignment.id,
          bucket: 'wrong-bucket',
          audioKey: uploadedAssignment.uploadKey,
          durationMs: 30_000,
          noiseRating: 'QUIET',
        }),
      ).rejects.toThrow('does not belong to this assignment');
    });
  });
});
