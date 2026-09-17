import { ExecutionContext } from '@nestjs/common';
import { AppThrottlerGuard } from './app-throttler.guard';
import { SubmissionRateLimitGuard } from './submission-rate-limit.guard';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';
import { UserThrottlerGuard } from './user-throttler.guard';

function contextWith(handlerGuards: unknown[], classGuards: unknown[] = []): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata('__guards__', handlerGuards, handler);
  class Controller {}
  if (classGuards.length) {
    Reflect.defineMetadata('__guards__', classGuards, Controller);
  }
  return {
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
}

describe('AppThrottlerGuard', () => {
  function shouldSkip(context: ExecutionContext) {
    const guard = new AppThrottlerGuard({} as never, {} as never, {} as never);
    return (
      guard as unknown as { shouldSkip: (c: ExecutionContext) => Promise<boolean> }
    ).shouldSkip(context);
  }

  it('skips routes already guarded by SubmissionRateLimitGuard', async () => {
    await expect(shouldSkip(contextWith([SubmissionRateLimitGuard]))).resolves.toBe(true);
  });

  it('skips routes already guarded by RegisterRateLimitGuard, at the class level', async () => {
    await expect(shouldSkip(contextWith([], [RegisterRateLimitGuard]))).resolves.toBe(true);
  });

  it('skips routes already guarded by UserThrottlerGuard (wallet/withdrawal/community routes) -- otherwise this blanket per-IP guard stacks underneath their per-user limit and can 429 a legitimate trainer sharing a NAT/carrier IP', async () => {
    await expect(shouldSkip(contextWith([UserThrottlerGuard]))).resolves.toBe(true);
  });

  it('skips routes guarded by UserThrottlerGuard at the class level', async () => {
    await expect(shouldSkip(contextWith([], [UserThrottlerGuard]))).resolves.toBe(true);
  });

  it('does not skip routes with no dedicated throttler guard', async () => {
    await expect(shouldSkip(contextWith([]))).resolves.toBe(false);
  });

  it('does not skip routes guarded by an unrelated guard', async () => {
    class SomeOtherGuard {}
    await expect(shouldSkip(contextWith([SomeOtherGuard]))).resolves.toBe(false);
  });
});
