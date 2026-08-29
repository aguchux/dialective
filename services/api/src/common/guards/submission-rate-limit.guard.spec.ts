import { ThrottlerGuard } from '@nestjs/throttler';
import { SubmissionRateLimitGuard } from './submission-rate-limit.guard';

function setup(overrides: { enabled?: boolean; limitPerHour?: number } = {}) {
  const platformSettings = {
    isSubmissionRateLimitEnabled: jest.fn().mockResolvedValue(overrides.enabled ?? true),
    getSubmissionRateLimitPerHour: jest.fn().mockResolvedValue(overrides.limitPerHour ?? 120),
  };
  const guard = new SubmissionRateLimitGuard(
    {} as never,
    {} as never,
    {} as never,
    platformSettings as never,
  );
  return { guard, platformSettings };
}

describe('SubmissionRateLimitGuard', () => {
  it('allows the request without consulting the parent throttler when the master switch is off', async () => {
    const { guard, platformSettings } = setup({ enabled: false });
    const superHandleRequest = jest.spyOn(ThrottlerGuard.prototype as never, 'handleRequest');

    const allowed = await (guard as unknown as {
      handleRequest: (...args: unknown[]) => Promise<boolean>;
    }).handleRequest({} as never, 30, 1000, {} as never, jest.fn(), jest.fn());

    expect(allowed).toBe(true);
    expect(platformSettings.getSubmissionRateLimitPerHour).not.toHaveBeenCalled();
    expect(superHandleRequest).not.toHaveBeenCalled();
    superHandleRequest.mockRestore();
  });

  it('delegates to the parent throttler with the admin-configured limit when enabled', async () => {
    const { guard, platformSettings } = setup({ enabled: true, limitPerHour: 45 });
    const superHandleRequest = jest
      .spyOn(ThrottlerGuard.prototype as never, 'handleRequest')
      .mockResolvedValue(true as never);

    const context = {} as never;
    const throttler = {} as never;
    const getTracker = jest.fn();
    const generateKey = jest.fn();
    await (guard as unknown as {
      handleRequest: (...args: unknown[]) => Promise<boolean>;
    }).handleRequest(context, 999, 1000, throttler, getTracker, generateKey);

    expect(platformSettings.getSubmissionRateLimitPerHour).toHaveBeenCalled();
    expect(superHandleRequest).toHaveBeenCalledWith(
      context,
      45,
      1000,
      throttler,
      getTracker,
      generateKey,
    );
    superHandleRequest.mockRestore();
  });

  it('keys the throttle bucket by the authenticated user, falling back to IP', async () => {
    const { guard } = setup();
    const tracker = (guard as unknown as {
      getTracker: (req: Record<string, unknown>) => Promise<string>;
    }).getTracker;

    await expect(tracker({ user: { sub: 'user-1' }, ip: '1.2.3.4' })).resolves.toBe('user-1');
    await expect(tracker({ ip: '1.2.3.4' })).resolves.toBe('1.2.3.4');
  });
});
