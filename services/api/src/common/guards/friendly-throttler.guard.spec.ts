import { ExecutionContext, HttpException } from '@nestjs/common';
import { AppThrottlerGuard } from './app-throttler.guard';
import { UserThrottlerGuard } from './user-throttler.guard';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';
import { SubmissionRateLimitGuard } from './submission-rate-limit.guard';

/**
 * Regression: @nestjs/throttler's default 429 body is the literal string
 * "ThrottlerException: Too Many Requests". The frontend renders data.message
 * verbatim, so that reached a trainer on the payout-wallet screen as raw
 * stack-speak with no indication of what went wrong or when to retry.
 */
describe('FriendlyThrottlerGuard (via every throttler guard that extends it)', () => {
  async function throwFor(guard: unknown, timeToExpire: number): Promise<HttpException> {
    const throwing = guard as unknown as {
      throwThrottlingException: (c: ExecutionContext, d: unknown) => Promise<void>;
    };
    try {
      await throwing.throwThrottlingException({} as ExecutionContext, {
        timeToExpire,
        totalHits: 99,
        ttl: timeToExpire,
        limit: 5,
        key: 'k',
        tracker: 'user-1',
      });
    } catch (err) {
      return err as HttpException;
    }
    throw new Error('expected throwThrottlingException to throw');
  }

  const guards: Array<[string, unknown]> = [
    ['AppThrottlerGuard', new AppThrottlerGuard({} as never, {} as never, {} as never)],
    ['UserThrottlerGuard', new UserThrottlerGuard({} as never, {} as never, {} as never)],
    [
      'RegisterRateLimitGuard',
      new RegisterRateLimitGuard({} as never, {} as never, {} as never, {} as never),
    ],
    [
      'SubmissionRateLimitGuard',
      new SubmissionRateLimitGuard({} as never, {} as never, {} as never, {} as never),
    ],
  ];

  it.each(guards)('%s never leaks the exception class name to the user', async (_name, guard) => {
    const err = await throwFor(guard, 3600);
    const body = err.getResponse() as { message: string };

    expect(body.message).not.toContain('ThrottlerException');
    expect(body.message).toContain('Too many attempts');
    expect(err.getStatus()).toBe(429);
  });

  it('tells the user when the limit clears, since these windows are hourly', async () => {
    const err = await throwFor(guards[1][1], 2700); // 45 minutes
    const body = err.getResponse() as { message: string; retryAfterSeconds: number };

    expect(body.message).toContain('45 minutes');
    // Machine-readable too, so a client can back off precisely rather than
    // parsing prose.
    expect(body.retryAfterSeconds).toBe(2700);
  });

  it.each([
    [30, 'a minute'],
    [60, 'a minute'],
    [120, '2 minutes'],
    [3600, 'an hour'],
    [7200, '2 hours'],
  ])('formats %is as "%s"', async (seconds, expected) => {
    const err = await throwFor(guards[0][1], seconds);
    expect((err.getResponse() as { message: string }).message).toContain(expected);
  });
});
