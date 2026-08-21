import { SubmissionsController } from './submissions.controller';

describe('SubmissionsController.getResult', () => {
  function setup(redisPayload: object) {
    const prisma: any = {
      submission: { findFirst: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
    };
    const streams: any = { get: jest.fn().mockResolvedValue(JSON.stringify(redisPayload)) };
    const storage: any = {};
    const asrRegistry: any = {};
    const platformSettings: any = {};
    const courses: any = {};
    const controller = new SubmissionsController(storage, streams, asrRegistry, prisma, platformSettings, courses);
    return { controller, prisma };
  }

  it('strips transcript and word_confidences before returning the result to the trainer', async () => {
    const { controller } = setup({
      status: 'ok',
      transcript: 'this is what the trainer said',
      word_confidences: [{ word: 'this', start: 0, end: 0.2, conf: 0.9 }],
    });

    const result = await controller.getResult({ user: { sub: 'user-1' } } as any, 'sub-1');

    expect(result).toEqual({ status: 'ok' });
    expect(result).not.toHaveProperty('transcript');
    expect(result).not.toHaveProperty('word_confidences');
  });

  it('passes through non-transcript fields (status, rejection reason) unchanged', async () => {
    const { controller } = setup({ status: 'rejected', reason: 'mostly_silence' });

    const result = await controller.getResult({ user: { sub: 'user-1' } } as any, 'sub-1');

    expect(result).toEqual({ status: 'rejected', reason: 'mostly_silence' });
  });

  it('404s when the submission does not belong to the requesting user', async () => {
    const { controller, prisma } = setup({ status: 'ok' });
    prisma.submission.findFirst.mockResolvedValue(null);

    await expect(controller.getResult({ user: { sub: 'someone-else' } } as any, 'sub-1')).rejects.toThrow('Submission not found');
  });
});

describe('SubmissionsController.create audit-hold gate', () => {
  function setup() {
    const prisma: any = {
      user: { findUnique: jest.fn() },
      prompt: { findFirst: jest.fn() },
    };
    const streams: any = { publish: jest.fn() };
    const storage: any = {};
    const asrRegistry: any = { resolve: jest.fn().mockReturnValue({ stream: 'asr-jobs-vosk' }) };
    const platformSettings: any = { getTaskTokenCost: jest.fn(), getDictationMaxRecordingSeconds: jest.fn() };
    const courses: any = { getIncompleteRequiredCourses: jest.fn().mockResolvedValue([]) };
    const controller = new SubmissionsController(storage, streams, asrRegistry, prisma, platformSettings, courses);
    return { controller, prisma };
  }

  const submissionId = '11111111-1111-1111-1111-111111111111';
  const promptId = '22222222-2222-2222-2222-222222222222';
  const body = {
    submissionId,
    dialectTag: 'ig',
    promptId,
    bucket: 'dialectiva-submissions',
    audioKey: `ig/${promptId}/${submissionId}.wav`,
  } as any;

  it('rejects before any prompt/token lookup when the trainer is on an active audit hold', async () => {
    const { controller, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ auditHoldAt: new Date('2026-01-01'), auditHoldReleasedAt: null });

    await expect(controller.create({ user: { sub: 'user-1' } } as any, body)).rejects.toThrow('temporarily on hold');
    expect(prisma.prompt.findFirst).not.toHaveBeenCalled();
  });

  it('does not block a trainer whose hold was already released', async () => {
    const { controller, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ auditHoldAt: new Date('2026-01-01'), auditHoldReleasedAt: new Date('2026-01-02') });
    prisma.prompt.findFirst.mockResolvedValue(null); // short-circuits with NotFoundException, proving the hold gate itself passed

    await expect(controller.create({ user: { sub: 'user-1' } } as any, body)).rejects.toThrow('Prompt not found');
  });
});
