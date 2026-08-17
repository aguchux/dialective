import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

/**
 * Same IP-keyed throttling as any other @Throttle()'d route, except the
 * limit itself comes from PlatformSettingsService.getRegisterRateLimitPerHour
 * instead of the static number baked into the decorator -- lets admin
 * raise/lower this from Settings without a backend redeploy. AuthController.
 * register still carries @Throttle({ default: { limit, ttl } }) for the ttl
 * (window length) and as the fallback limit if settings are somehow
 * unavailable; only the limit actually enforced here is swapped out.
 */
@Injectable()
export class RegisterRateLimitGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly platformSettings: PlatformSettingsService,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: Parameters<ThrottlerGuard['handleRequest']>[3],
    getTracker: Parameters<ThrottlerGuard['handleRequest']>[4],
    generateKey: Parameters<ThrottlerGuard['handleRequest']>[5],
  ): Promise<boolean> {
    const dynamicLimit = await this.platformSettings.getRegisterRateLimitPerHour();
    return super.handleRequest(context, dynamicLimit, ttl, throttler, getTracker, generateKey);
  }
}
