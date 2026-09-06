import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CommunitySettingsService } from './community-settings.service';
import { UpdateCommunitySettingsDto } from './dto/update-community-settings.dto';

@Controller('admin/community/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CommunitySettingsController {
  constructor(private readonly settings: CommunitySettingsService) {}

  @Get()
  get() {
    return this.settings.getForAdmin();
  }

  @Patch()
  update(@Body() dto: UpdateCommunitySettingsDto) {
    return this.settings.update(dto);
  }
}
