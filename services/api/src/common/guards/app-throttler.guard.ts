import { ExecutionContext, Injectable } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SubmissionRateLimitGuard } from './submission-rate-limit.guard';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';

// Routes that already carry one of these via their own @UseGuards() run
// their own (possibly admin-gated) throttling and must not also be counted
// against this blanket app-wide guard -- otherwise the two stack, and an
// admin turning a dedicated limit OFF (e.g. submissionRateLimitEnabled)
// still leaves the request throttled by this fixed, ungated one underneath.
const DEDICATED_THROTTLER_GUARDS = [SubmissionRateLimitGuard, RegisterRateLimitGuard];

/**
 * The APP_GUARD-registered ThrottlerGuard (app.module.ts) -- a blanket
 * 60/min-per-IP backstop for every route that doesn't declare its own
 * throttling. Skips routes already guarded by a dedicated throttler guard
 * (see DEDICATED_THROTTLER_GUARDS) so they aren't throttled twice over.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const reflector = new Reflector();
    const handlerGuards =
      reflector.get<unknown[]>(GUARDS_METADATA, context.getHandler()) ?? [];
    const classGuards = reflector.get<unknown[]>(GUARDS_METADATA, context.getClass()) ?? [];
    const appliedGuards = [...handlerGuards, ...classGuards];
    return appliedGuards.some((guard) =>
      DEDICATED_THROTTLER_GUARDS.includes(guard as (typeof DEDICATED_THROTTLER_GUARDS)[number]),
    );
  }
}
