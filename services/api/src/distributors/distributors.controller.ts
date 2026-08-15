import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateDistributorAllocationDto, ListDistributorAllocationsDto, UpdateDistributorSettingsDto } from './dto/distributor.dto';
import { DistributorsService } from './distributors.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributorsController {
  constructor(private readonly distributors: DistributorsService) {}

  @Get('distributors/dashboard')
  @Roles(Role.DISTRIBUTOR)
  dashboard(@Req() req: AuthenticatedRequest) {
    return this.distributors.dashboard(req.user.sub);
  }

  @Get('distributors/network')
  @Roles(Role.DISTRIBUTOR)
  network(@Req() req: AuthenticatedRequest) {
    return this.distributors.network(req.user.sub);
  }

  @Get('admin/distributors/settings')
  @Roles(Role.ADMIN)
  adminSettings() {
    return this.distributors.getSettings();
  }

  @Patch('admin/distributors/settings')
  @Roles(Role.ADMIN)
  updateAdminSettings(@Body() body: UpdateDistributorSettingsDto) {
    return this.distributors.updateSettings(body);
  }

  @Post('admin/distributors/:id/allocations')
  @Roles(Role.ADMIN)
  allocate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CreateDistributorAllocationDto) {
    return this.distributors.allocateTokens(req.user.sub, id, body);
  }

  @Get('admin/distributors/allocations')
  @Roles(Role.ADMIN)
  listAllocations(@Query() query: ListDistributorAllocationsDto) {
    return this.distributors.listAllocations(query);
  }
}
