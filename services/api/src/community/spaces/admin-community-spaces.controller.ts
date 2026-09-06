import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ReorderCommunitySpacesDto } from '../dto/reorder-community-spaces.dto';
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

  // Must come before the :id patch route so Nest doesn't match "reorder" as
  // an :id path segment.
  @Patch('reorder')
  reorder(@Body() dto: ReorderCommunitySpacesDto) {
    return this.spaces.reorderForAdmin(dto.orderedIds);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertCommunitySpaceDto>) {
    return this.spaces.updateForAdmin(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.spaces.deleteForAdmin(id);
  }
}
