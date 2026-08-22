import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import {
  AdjustSubDistributorWalletDto,
  CreateDistributorAllocationDto,
  ListDistributorActivityDto,
  ListDistributorAllocationsDto,
  UpdateDistributorSettingsDto,
  UpdateSubDistributorStatusDto,
} from './dto/distributor.dto';
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
  allocate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateDistributorAllocationDto,
  ) {
    return this.distributors.allocateTokens(req.user.sub, id, body);
  }

  @Get('admin/distributors/allocations')
  @Roles(Role.ADMIN)
  listAllocations(@Query() query: ListDistributorAllocationsDto) {
    return this.distributors.listAllocations(query);
  }

  @Get('admin/distributors')
  @Roles(Role.ADMIN)
  listAdmin() {
    return this.distributors.listAdmin();
  }

  @Get('admin/distributors/:id/activity')
  @Roles(Role.ADMIN)
  getActivity(@Param('id') id: string, @Query() query: ListDistributorActivityDto) {
    return this.distributors.getActivity(id, query);
  }

  // --- Distributor-facing: manage own sub-distributors -------------------

  @Post('distributors/sub-distributors/:id/promote')
  @Roles(Role.DISTRIBUTOR)
  promoteSubDistributor(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.distributors.promoteSubDistributor(req.user.sub, id);
  }

  @Get('distributors/sub-distributors')
  @Roles(Role.DISTRIBUTOR)
  listSubDistributors(@Req() req: AuthenticatedRequest) {
    return this.distributors.listSubDistributors(req.user.sub);
  }

  @Post('distributors/sub-distributors/:id/allocations')
  @Roles(Role.DISTRIBUTOR)
  allocateToSubDistributor(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateDistributorAllocationDto,
  ) {
    return this.distributors.allocateToSubDistributor(req.user.sub, id, body);
  }

  @Get('distributors/sub-distributors/:id/activity')
  @Roles(Role.DISTRIBUTOR)
  getSubDistributorActivity(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ListDistributorActivityDto,
  ) {
    return this.distributors.getSubDistributorActivity(req.user.sub, id, query);
  }

  @Patch('distributors/sub-distributors/:id/status')
  @Roles(Role.DISTRIBUTOR)
  updateSubDistributorStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateSubDistributorStatusDto,
  ) {
    return this.distributors.updateSubDistributorStatus(req.user.sub, id, body.status);
  }

  @Post('distributors/sub-distributors/:id/adjustments/otp')
  @Roles(Role.DISTRIBUTOR)
  requestSubDistributorAdjustmentOtp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AdjustSubDistributorWalletDto,
  ) {
    return this.distributors.requestSubDistributorAdjustmentOtp(req.user.sub, id, body);
  }

  @Post('distributors/sub-distributors/:id/adjustments')
  @Roles(Role.DISTRIBUTOR)
  adjustSubDistributorWallet(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AdjustSubDistributorWalletDto,
  ) {
    return this.distributors.adjustSubDistributorWallet(req.user.sub, id, body);
  }
}
