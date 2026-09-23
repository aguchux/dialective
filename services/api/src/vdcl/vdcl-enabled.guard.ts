import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/**
 * The contributor-facing VDCL gate.
 *
 * Guards the whole `/vdcl` controller -- the only surface a non-admin can
 * reach. While `PlatformSettings.vdclEnabled` is off, every route under it
 * refuses, including the read-only ones: a contributor who cannot sign has no
 * reason to be shown a readiness score or a draft either, and leaving reads
 * open would let the dashboard render a licence flow that dead-ends at the
 * first write.
 *
 * Deliberately NOT applied to:
 *
 * - `/admin/vdcl` -- the flow has to be exercisable before publication, which
 *   is the entire reason the gate exists. An admin gating a feature off then
 *   finding they cannot test it is a gate that fights its own purpose.
 * - `/verify/:token` -- a certificate already in someone's hands must keep
 *   verifying. That route asserts a historical fact about a licence that was
 *   issued; whether new licences may be created today has no bearing on it,
 *   and breaking it would turn an admin toggle into a retroactive
 *   invalidation of documents in the world.
 *
 * The frontend hides the licence nav item and route off the same flag via
 * /settings/public, but that is cosmetic. This is the gate.
 */
@Injectable()
export class VdclEnabledGuard implements CanActivate {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (await this.platformSettings.isVdclEnabled()) {
      return true;
    }
    // 403 rather than 404: the feature exists and is coming, it is just not
    // open yet. Pretending the route is absent would send a contributor
    // chasing a bug that is actually a deliberate setting.
    throw new ForbiddenException(
      'Contributor licensing is not open yet. It will be available once licence publication is complete.',
    );
  }
}
