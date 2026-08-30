import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

/**
 * Per-Stream-Key rate limit (doc section 35 step 10 / section 36 "rate-limit
 * events"), sourced from the key's organization's SubscriptionPlan.rateLimitPerMinute
 * -- a per-plan cap (same nullable-Int-on-SubscriptionPlan shape as
 * maxStreamDecks), not a PlatformSettingsService global dial, since this
 * value legitimately varies per subscription tier. null means unlimited for
 * that plan (falls through to the module-wide ThrottlerModule.forRoot
 * default, which stays as a hard ceiling for any key regardless of plan).
 */
@Injectable()
export class StreamKeyRateLimitGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.streamKey?.id ?? req.ip;
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: Parameters<ThrottlerGuard['handleRequest']>[3],
    getTracker: Parameters<ThrottlerGuard['handleRequest']>[4],
    generateKey: Parameters<ThrottlerGuard['handleRequest']>[5],
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.streamKey.organizationId },
      include: { plan: true },
    });
    const perMinuteLimit = subscription?.plan.rateLimitPerMinute;
    if (perMinuteLimit == null) {
      return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
    }
    // ThrottlerModule.forRoot's default window is 60s -- a per-plan
    // rateLimitPerMinute maps directly onto it without needing a custom ttl.
    return super.handleRequest(context, perMinuteLimit, ttl, throttler, getTracker, generateKey);
  }
}
