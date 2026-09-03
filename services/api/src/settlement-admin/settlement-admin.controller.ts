import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettlementAdminService } from './settlement-admin.service';
import { ListUnsettledDto } from './dto/list-unsettled.dto';
import { SettleAllDto } from './dto/settle-all.dto';
import { SettleOneDto } from './dto/settle-one.dto';

@Controller('admin-settlement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SettlementAdminController {
  constructor(private readonly settlement: SettlementAdminService) {}

  @Get('unsettled')
  listUnsettled(@Query() query: ListUnsettledDto) {
    return this.settlement.listUnsettled(query);
  }

  @Post(':id/settle')
  settleOne(@Param('id') id: string, @Body() dto: SettleOneDto) {
    return this.settlement.settleOne(id, dto.force ?? false);
  }

  @Post('settle-all')
  settleAll(@Body() dto: SettleAllDto) {
    return this.settlement.settleAll(dto.force ?? false);
  }
}
