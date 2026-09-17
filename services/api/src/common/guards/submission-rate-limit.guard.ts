import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { FriendlyThrottlerGuard } from './friendly-throttler.guard';

/**
 * Per-trainer submission throttle for POST /submissions/create and
 * POST /words/recordings -- the two calls that actually debit tokens,
 * persist a row, and enqueue an ASR job, so this is where a runaway or
 * scripted client would otherwise be able to push the ASR/quality-gate
 * worker queues far past sustainable throughput. Keyed by req.user.sub
 * (like UserThrottlerGuard) rather than IP, since every route this guards
 * always runs behind JwtAuthGuard first. Off by default
 * (submissionRateLimitEnabled) so existing deployments are unaffected until
 * an admin opts in from Settings; the per-hour limit itself is also
 * admin-tunable (submissionRateLimitPerHour) without a redeploy, same
 * pattern as RegisterRateLimitGuard.
 */
@Injectable()
export class SubmissionRateLimitGuard extends FriendlyThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly platformSettings: PlatformSettingsService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.sub ?? req.ip;
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: Parameters<FriendlyThrottlerGuard['handleRequest']>[3],
    getTracker: Parameters<FriendlyThrottlerGuard['handleRequest']>[4],
    generateKey: Parameters<FriendlyThrottlerGuard['handleRequest']>[5],
  ): Promise<boolean> {
    if (!(await this.platformSettings.isSubmissionRateLimitEnabled())) {
      return true;
    }
    const dynamicLimit = await this.platformSettings.getSubmissionRateLimitPerHour();
    return super.handleRequest(context, dynamicLimit, ttl, throttler, getTracker, generateKey);
  }
}
