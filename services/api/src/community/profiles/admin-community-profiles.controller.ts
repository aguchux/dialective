import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ListCommunityMembersAdminDto } from '../dto/list-community-members-admin.dto';
import { CommunityProfilesService } from './community-profiles.service';

@Controller('admin/community/members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunityProfilesController {
  constructor(private readonly profiles: CommunityProfilesService) {}

  @Get()
  list(@Query() query: ListCommunityMembersAdminDto) {
    return this.profiles.listForAdmin(query);
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.profiles.getDetailForAdmin(id);
  }
}
