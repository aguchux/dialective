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
