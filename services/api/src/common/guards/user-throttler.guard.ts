import { Injectable } from '@nestjs/common';
import { FriendlyThrottlerGuard } from './friendly-throttler.guard';

/**
 * Keys rate-limit buckets by authenticated user (req.user.sub, set by
 * JwtAuthGuard) instead of IP -- for routes that always run behind
 * JwtAuthGuard (wallet/admin OTP routes), this is the correct scope: a
 * shared office/NAT IP shouldn't throttle every user together, and a
 * single abusive user rotating IPs shouldn't evade the limit. Falls back to
 * IP only if req.user is somehow absent (defensive; shouldn't happen given
 * JwtAuthGuard always runs first on these routes).
 */
@Injectable()
export class UserThrottlerGuard extends FriendlyThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.sub ?? req.ip;
  }
}
