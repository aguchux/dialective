import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@dialectiva/db';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { TopBannerUploadDto } from './dto/top-banner-upload.dto';

/**
 * General + notification settings grouped in the admin Settings UI.
 * Referral bonus settings are a separate, older DB-backed group -- see
 * WalletController's admin/referral-settings routes; not duplicated here.
 */
@Controller('admin/platform-settings')
export class SettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getSettings() {
    return this.settings.getForAdmin();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    const { authMaintenanceUntil, ...rest } = dto;
    return this.settings.update({
      ...rest,
      ...(authMaintenanceUntil !== undefined && {
        authMaintenanceUntil: authMaintenanceUntil === null ? null : new Date(authMaintenanceUntil),
      }),
    });
  }

  @Post('top-banner/upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  uploadTopBannerImage(@Body() dto: TopBannerUploadDto) {
    return this.settings.uploadTopBannerImage(dto.contentType);
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
