import { ExecutionContext, HttpException } from '@nestjs/common';
import { SubmissionDailyLimitGuard } from './submission-daily-limit.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

describe('SubmissionDailyLimitGuard', () => {
  const prisma = {
    wordRecording: { count: jest.fn(), findFirst: jest.fn() },
  };
  const platformSettings = { getSubmissionDailyLimit: jest.fn() };

  const guard = new SubmissionDailyLimitGuard(
    prisma as unknown as PrismaService,
    platformSettings as unknown as PlatformSettingsService,
  );

  function contextFor(userId?: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: userId ? { sub: userId } : undefined }) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    platformSettings.getSubmissionDailyLimit.mockResolvedValue({ enabled: true, perDay: 200 });
    prisma.wordRecording.findFirst.mockResolvedValue({ createdAt: new Date() });
  });

  it('allows the request without querying at all when the cap is disabled', async () => {
    platformSettings.getSubmissionDailyLimit.mockResolvedValue({ enabled: false, perDay: 200 });

    await expect(guard.canActivate(contextFor('trainer'))).resolves.toBe(true);
    // The whole point of the toggle is that a disabled cap costs nothing.
    expect(prisma.wordRecording.count).not.toHaveBeenCalled();
  });

  it('allows a trainer below the cap', async () => {
    prisma.wordRecording.count.mockResolvedValue(199);

    await expect(guard.canActivate(contextFor('trainer'))).resolves.toBe(true);
  });

  it('blocks at exactly the cap, not one past it', async () => {
    // 200 already submitted against a limit of 200 means the allowance is
    // spent -- allowing this request would make the real limit 201.
    prisma.wordRecording.count.mockResolvedValue(200);

    await expect(guard.canActivate(contextFor('trainer'))).rejects.toBeInstanceOf(HttpException);
  });

  it('counts over a rolling 24h window, not the calendar day', async () => {
    prisma.wordRecording.count.mockResolvedValue(10);
    const before = Date.now();

    await guard.canActivate(contextFor('trainer'));

    const where = prisma.wordRecording.count.mock.calls[0][0].where;
    expect(where.userId).toBe('trainer');
    const since: Date = where.createdAt.gte;
    const windowMs = before - since.getTime();
    // ~24h back, allowing a little slack for test execution time.
    expect(windowMs).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(windowMs).toBeLessThan(24.1 * 60 * 60 * 1000);
  });

  it('tells the trainer when they can record again, based on the oldest submission', async () => {
    prisma.wordRecording.count.mockResolvedValue(200);
    // Oldest submission was 21h ago, so the window clears in ~3h.
    prisma.wordRecording.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 21 * 60 * 60 * 1000),
    });

    await expect(guard.canActivate(contextFor('trainer'))).rejects.toMatchObject({
      response: {
        statusCode: 429,
        message: "You've reached today's limit of 200 recordings. You can record again in 3 hours.",
      },
    });
  });

  it('fails open when no authenticated user is present', async () => {
    // Guard ordering mistake, not a caller problem -- blocking a real
    // trainer over that would be worse than skipping the cap.
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
    expect(prisma.wordRecording.count).not.toHaveBeenCalled();
  });
});
