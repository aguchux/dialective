import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { UpsertCommunitySpaceDto } from '../dto/upsert-community-space.dto';
import { CommunitySpacesService } from './community-spaces.service';

@Controller('admin/community/spaces')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunitySpacesController {
  constructor(private readonly spaces: CommunitySpacesService) {}

  @Get()
  list() {
    return this.spaces.listForAdmin();
  }

  @Post()
  create(@Body() dto: UpsertCommunitySpaceDto) {
    return this.spaces.createForAdmin(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertCommunitySpaceDto>) {
    return this.spaces.updateForAdmin(id, dto);
  }
}
