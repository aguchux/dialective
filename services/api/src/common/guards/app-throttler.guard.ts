import { ExecutionContext, Injectable } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { SubmissionRateLimitGuard } from './submission-rate-limit.guard';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';
import { UserThrottlerGuard } from './user-throttler.guard';
import { FriendlyThrottlerGuard } from './friendly-throttler.guard';

// Routes that already carry one of these via their own @UseGuards() run
// their own (possibly admin-gated) throttling and must not also be counted
// against this blanket app-wide guard -- otherwise the two stack, and an
// admin turning a dedicated limit OFF (e.g. submissionRateLimitEnabled)
// still leaves the request throttled by this fixed, ungated one underneath.
// UserThrottlerGuard specifically must be exempted too: it's the intended
// definitive per-user limit for wallet/withdrawal/payout-account/community
// routes (each with its own @Throttle() override), keyed by user id rather
// than IP. Without this exemption, this blanket 60/min-PER-IP guard still
// ran underneath it uncounted -- on a shared/NAT/carrier-grade IP (common on
// mobile data in low-connectivity regions), other trainers' unrelated
// traffic on the same IP could exhaust the shared bucket and produce a 429
// on withdrawal even though that trainer was nowhere near their own
// per-user withdrawal limit. Reported as trainers seeing "too many
// requests" blocking withdrawal.
const DEDICATED_THROTTLER_GUARDS = [
  SubmissionRateLimitGuard,
  RegisterRateLimitGuard,
  UserThrottlerGuard,
];

/**
 * The APP_GUARD-registered ThrottlerGuard (app.module.ts) -- a blanket
 * 60/min-per-IP backstop for every route that doesn't declare its own
 * throttling. Skips routes already guarded by a dedicated throttler guard
 * (see DEDICATED_THROTTLER_GUARDS) so they aren't throttled twice over.
 */
@Injectable()
export class AppThrottlerGuard extends FriendlyThrottlerGuard {
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
