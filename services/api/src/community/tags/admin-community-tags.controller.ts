import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CreateCommunityTagDto } from '../dto/create-community-tag.dto';
import { CommunityTagsService } from './community-tags.service';

@Controller('admin/community/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunityTagsController {
  constructor(private readonly tags: CommunityTagsService) {}

  @Get()
  list() {
    return this.tags.list();
  }

  @Post()
  create(@Body() dto: CreateCommunityTagDto) {
    return this.tags.createForAdmin(dto);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body('name') name: string) {
    return this.tags.renameForAdmin(id, name);
  }

  @Post(':id/merge/:targetId')
  merge(@Param('id') id: string, @Param('targetId') targetId: string) {
    return this.tags.mergeForAdmin(id, targetId);
  }

  @Patch(':id/hidden')
  setHidden(@Param('id') id: string, @Body('isHidden') isHidden: boolean) {
    return this.tags.setHiddenForAdmin(id, isHidden);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.tags.deleteUnusedForAdmin(id);
  }
}
