import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { OtpPurpose, Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { OtpService } from '../../otp/otp.service';
import { resolveOtpDestination } from '../../otp/otp.util';
import { adminActionContextHash } from '../../wallet/otp-context.util';
import { RoyaltyRateService } from './royalty-rate.service';

interface AdminRequest {
  user: { sub: string };
}

class ToggleOtpDto {
  @IsBoolean()
  enabling!: boolean;
}

class ApplyToggleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

class ScheduleRateDto {
  /** Percent, 0-100. Bounded here as well as by the Decimal(5,2) column. */
  @IsNumber()
  @Min(0)
  @Max(100)
  sharePercent!: number;

  @IsOptional()
  @IsString()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

/**
 * Admin controls for Stream revenue sharing.
 *
 * Three actions, each its own route with its own step-up rather than fields on a
 * shared settings PATCH -- so a code guards exactly one change and nothing else.
 * That matters most for `shadow-mode`: leaving shadow mode is the moment
 * settlement starts crediting real balances, and it must not be reachable as a
 * side effect of saving an unrelated form.
 *
 * Every step-up is DIRECTION-bound, so a code issued to stop settlement cannot
 * be replayed to start it.
 *
 * **The rate never writes `PlatformSettings` directly.** It schedules a
 * `RoyaltyRatePeriod` effective from the next period, because
 * docs/Stream-Revenue-Sharing-Engine.md 5.4 promises a change applies only to
 * usage streamed after it. Writing the setting would let a late settlement
 * reprice usage already streamed under the old rate -- the setting column exists
 * only as the seed for the first baseline.
 */
@Controller('admin/royalties')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RoyaltyAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly otp: OtpService,
    private readonly rates: RoyaltyRateService,
  ) {}

  /** Current state of every royalty control, plus the live rate schedule. */
  @Get('settings')
  async getSettings() {
    const [enabled, shadowMode, configuredRate, minimumPayout, runCap, schedule] =
      await Promise.all([
        this.settings.areRoyaltiesEnabled(),
        this.settings.isRoyaltyShadowMode(),
        this.settings.getRoyaltySharePercent(),
        this.settings.getRoyaltyMinimumPayout(),
        this.settings.getRoyaltyMaxRunAccrualDl(),
        this.prisma.royaltyRatePeriod.findMany({
          orderBy: { effectiveFrom: 'desc' },
          take: 24,
          select: {
            id: true,
            sharePercent: true,
            effectiveFrom: true,
            changedByUserId: true,
            createdAt: true,
          },
        }),
      ]);
    return {
      royaltiesEnabled: enabled,
      royaltyShadowMode: shadowMode,
      /**
       * The SEED value, not what settlement uses. Settlement resolves the rate
       * from the schedule below; this is only the baseline the first period is
       * seeded from.
       */
      configuredSharePercent: configuredRate.toString(),
      minimumPayout: minimumPayout.toString(),
      maxRunAccrualDl: runCap.toString(),
      rateSchedule: schedule.map((row) => ({
        id: row.id,
        sharePercent: row.sharePercent.toString(),
        effectiveFrom: row.effectiveFrom,
        changedByUserId: row.changedByUserId,
        createdAt: row.createdAt,
      })),
    };
  }

  @Post('enabled/otp')
  async requestEnabledOtp(@Req() req: AdminRequest, @Body() dto: ToggleOtpDto) {
    return this.issue(req.user.sub, {
      action: 'royalties-enabled-toggle',
      direction: dto.enabling ? 'enable' : 'disable',
    });
  }

  @Post('enabled')
  async applyEnabled(@Req() req: AdminRequest, @Body() dto: ApplyToggleDto) {
    const current = await this.settings.areRoyaltiesEnabled();
    // A request resending the current value is a no-op. Demanding a code for it
    // would train admins to treat the prompt as noise.
    if (dto.enabled === current) return this.getSettings();
    await this.verify(req.user.sub, dto, {
      action: 'royalties-enabled-toggle',
      direction: dto.enabled ? 'enable' : 'disable',
    });
    await this.settings.update({ royaltiesEnabled: dto.enabled });
    return this.getSettings();
  }

  @Post('shadow-mode/otp')
  async requestShadowModeOtp(@Req() req: AdminRequest, @Body() dto: ToggleOtpDto) {
    return this.issue(req.user.sub, {
      action: 'royalty-shadow-mode-toggle',
      direction: dto.enabling ? 'enable' : 'disable',
    });
  }

  /**
   * Leave or re-enter shadow mode.
   *
   * Leaving it (`enabled: false`) is the single highest-consequence switch in
   * this engine: from that point settlement mints nothing but does credit real
   * `royaltyBalance`. Section 7 requires at least one full period of real
   * traffic through shadow mode first, which no code can enforce -- so the
   * refusal below at least makes sure it cannot happen while there is no
   * settled usage history at all.
   */
  @Post('shadow-mode')
  async applyShadowMode(@Req() req: AdminRequest, @Body() dto: ApplyToggleDto) {
    const current = await this.settings.isRoyaltyShadowMode();
    if (dto.enabled === current) return this.getSettings();
    await this.verify(req.user.sub, dto, {
      action: 'royalty-shadow-mode-toggle',
      direction: dto.enabled ? 'enable' : 'disable',
    });

    if (!dto.enabled) {
      // Leaving shadow mode. Refuse while no pool has ever been computed: the
      // split rule would then be handling money on its first ever run, which is
      // exactly what section 7 forbids.
      const pools = await this.prisma.royaltyPool.count();
      if (pools === 0) {
        throw new UnprocessableEntityException(
          'No royalty pool has been computed yet. Shadow mode must run for at least one full period before settlement can credit balances.',
        );
      }
    }

    await this.settings.update({ royaltyShadowMode: dto.enabled });
    return this.getSettings();
  }

  @Post('rate/otp')
  async requestRateOtp(@Req() req: AdminRequest, @Body() dto: ScheduleRateDto) {
    return this.issue(req.user.sub, {
      action: 'royalty-rate-schedule',
      sharePercent: dto.sharePercent,
      effectiveFrom: nextPeriodIso(),
    });
  }

  /**
   * Schedule a share-rate change from the next period.
   *
   * Never applies to the current period, and never writes the settings column --
   * see the class comment and 5.4.
   */
  @Post('rate')
  async scheduleRate(@Req() req: AdminRequest, @Body() dto: ScheduleRateDto) {
    await this.verify(req.user.sub, dto, {
      action: 'royalty-rate-schedule',
      sharePercent: dto.sharePercent,
      effectiveFrom: nextPeriodIso(),
    });
    const effectiveFrom = await this.rates.scheduleChange(dto.sharePercent, req.user.sub);
    return { effectiveFrom, sharePercent: dto.sharePercent };
  }

  private async issue(
    adminUserId: string,
    context: Parameters<typeof adminActionContextHash>[0],
  ) {
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const { destination, channel } = await resolveOtpDestination(admin, this.settings);
    return this.otp.issueForUser(
      adminUserId,
      OtpPurpose.ADMIN_PAYOUT,
      destination,
      adminActionContextHash(context),
      channel,
    );
  }

  /**
   * Gated on the same platform setting as every other admin step-up, so an admin
   * who turns admin OTP off is not locked out by a code they can no longer
   * receive.
   */
  private async verify(
    adminUserId: string,
    dto: { otpRequestId?: string; code?: string },
    context: Parameters<typeof adminActionContextHash>[0],
  ): Promise<void> {
    if (!(await this.settings.isAdminPayoutOtpEnabled())) return;
    if (!dto.otpRequestId || !dto.code) {
      throw new UnprocessableEntityException('Confirm this change with the code sent to you');
    }
    await this.otp.verify({
      otpRequestId: dto.otpRequestId,
      userId: adminUserId,
      purpose: OtpPurpose.ADMIN_PAYOUT,
      code: dto.code,
      contextHash: adminActionContextHash(context),
    });
  }
}

/**
 * The next period anchor, as a date string.
 *
 * Bound into the rate context hash so a code cannot be held across a month
 * boundary and replayed to schedule the rate into a period the admin never saw.
 */
function nextPeriodIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}
