import { Body, Controller, Get, Param, ParseEnumPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettlementAdminService, SettlementKind } from './settlement-admin.service';
import { ListUnsettledDto } from './dto/list-unsettled.dto';
import { SettleAllDto } from './dto/settle-all.dto';
import { SettleOneDto } from './dto/settle-one.dto';

const SETTLEMENT_KINDS: SettlementKind[] = ['word', 'submission'];

@Controller('admin-settlement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SettlementAdminController {
  constructor(private readonly settlement: SettlementAdminService) {}

  @Get('unsettled')
  listUnsettled(@Query() query: ListUnsettledDto) {
    return this.settlement.listUnsettled(query);
  }

  @Post(':kind/:id/settle')
  settleOne(
    @Param('kind', new ParseEnumPipe(SETTLEMENT_KINDS)) kind: SettlementKind,
    @Param('id') id: string,
    @Body() dto: SettleOneDto,
  ) {
    return this.settlement.settleOne(kind, id, dto.force ?? false);
  }

  @Post('settle-all')
  settleAll(@Body() dto: SettleAllDto) {
    return this.settlement.settleAll(dto.kind, dto.force ?? false);
  }
}
