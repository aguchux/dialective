import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OtpPurpose, Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { resolveOtpDestination } from '../otp/otp.util';
import { adminActionContextHash } from '../wallet/otp-context.util';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { TopBannerUploadDto } from './dto/top-banner-upload.dto';
import { TrainingEconomyOtpDto } from './dto/training-economy-otp.dto';

/**
 * General + notification settings grouped in the admin Settings UI.
 * Referral bonus settings are a separate, older DB-backed group -- see
 * WalletController's admin/referral-settings routes; not duplicated here.
 */
@Controller('admin/platform-settings')
export class SettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getSettings() {
    return this.settings.getForAdmin();
  }

  /**
   * Issue a step-up code for switching the training economy on or off.
   *
   * Separate from the settings PATCH because that one endpoint carries every
   * setting on the page. Demanding a code for a copy tweak would train
   * admins to treat the prompt as noise, which is how a step-up stops being
   * a safeguard.
   */
  @Post('training-economy/otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async requestTrainingEconomyOtp(
    @Body() dto: TrainingEconomyOtpDto,
    @Req() req: { user: { sub: string } },
  ) {
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const { destination, channel } = await resolveOtpDestination(admin, this.settings);
    return this.otp.issueForUser(
      req.user.sub,
      OtpPurpose.TRAINING_ECONOMY_TOGGLE,
      destination,
      adminActionContextHash({
        action: 'training-economy-toggle',
        direction: dto.enabling ? 'enable' : 'disable',
      }),
      channel,
    );
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @Req() req: { user: { sub: string } },
  ) {
    const { authMaintenanceUntil, trainingEconomyOtpRequestId, trainingEconomyOtpCode, ...rest } =
      dto;

    // Switching the training economy is the one field on this endpoint that
    // starts or stops money moving platform-wide, so it carries a step-up
    // while the rest of the payload does not. Verified only when the value
    // actually CHANGES -- a PATCH that happens to resend the current value
    // alongside an unrelated edit is not a toggle and must not demand a code.
    if (rest.trainingEconomyEnabled !== undefined) {
      const current = await this.settings.isTrainingEconomyEnabled();
      if (rest.trainingEconomyEnabled !== current) {
        await this.verifyTrainingEconomyStepUp(
          req.user.sub,
          rest.trainingEconomyEnabled,
          trainingEconomyOtpRequestId,
          trainingEconomyOtpCode,
        );
      }
    }

    return this.settings.update({
      ...rest,
      ...(authMaintenanceUntil !== undefined && {
        authMaintenanceUntil: authMaintenanceUntil === null ? null : new Date(authMaintenanceUntil),
      }),
    });
  }

  /**
   * Gated on the same platform setting as every other admin step-up, so an
   * admin who turns admin OTP off is not locked out by a code they can no
   * longer receive.
   */
  private async verifyTrainingEconomyStepUp(
    adminUserId: string,
    enabling: boolean,
    otpRequestId?: string,
    code?: string,
  ) {
    if (!(await this.settings.isAdminPayoutOtpEnabled())) {
      return;
    }
    if (!otpRequestId || !code) {
      throw new UnprocessableEntityException(
        `OTP verification is required to ${enabling ? 'resume' : 'stop'} training payouts`,
      );
    }
    await this.otp.verify({
      otpRequestId,
      userId: adminUserId,
      purpose: OtpPurpose.TRAINING_ECONOMY_TOGGLE,
      code,
      // Bound to the direction: a code issued to stop the economy cannot be
      // replayed to resume it.
      contextHash: adminActionContextHash({
        action: 'training-economy-toggle',
        direction: enabling ? 'enable' : 'disable',
      }),
    });
  }

  @Post('top-banner/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  uploadTopBannerImage(@Body() dto: TopBannerUploadDto) {
    return this.settings.uploadTopBannerImage(dto.contentType);
  }

  @Post('connect-hero/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  uploadConnectHeroImage(@Body() dto: TopBannerUploadDto) {
    return this.settings.uploadConnectHeroImage(dto.contentType);
  }
}

@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('public')
  getPublicSettings() {
    return this.settings.getPublicClientSettings();
  }
}

@Controller('voice-stream/settings')
export class StreamPublicSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('public')
  getStreamPublicSettings() {
    return this.settings.getStreamPublicClientSettings();
  }
}
