import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DatasetStorageService } from './dataset-storage.service';
import { CreateAudioRetentionRuleDto } from './dto/create-audio-retention-rule.dto';
import { UpdateAudioRetentionRuleDto } from './dto/update-audio-retention-rule.dto';

@Controller('admin/dataset-storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DatasetStorageController {
  constructor(private readonly datasetStorage: DatasetStorageService) {}

  @Get('rules')
  listRules() {
    return this.datasetStorage.listRules();
  }

  @Post('rules')
  createRule(@Body() dto: CreateAudioRetentionRuleDto) {
    return this.datasetStorage.createRule(dto);
  }

  @Patch('rules/:id')
  updateRule(@Param('id') id: string, @Body() dto: UpdateAudioRetentionRuleDto) {
    return this.datasetStorage.updateRule(id, dto);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.datasetStorage.deleteRule(id);
  }
}
