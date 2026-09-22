import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { VdclAdminService } from './vdcl-admin.service';
import { ListVdclAgreementsDto, VdclReasonDto } from './dto/vdcl-lifecycle.dto';

interface AuthedRequest {
  user: { sub: string };
}

/**
 * Admin lifecycle control over VDCL agreements.
 *
 * This is the one surface where contributor identity and licence state are
 * both visible -- Dialect Library sits in the middle and is the only party
 * that sees both halves. Nothing here may be reused for a subscriber- or
 * contributor-facing route.
 */
@Controller('admin/vdcl')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class VdclAdminController {
  constructor(private readonly vdclAdmin: VdclAdminService) {}

  @Get('agreements')
  listAgreements(@Query() query: ListVdclAgreementsDto) {
    return this.vdclAdmin.listAgreements(query);
  }

  @Get('agreements/:id')
  getAgreement(@Param('id') id: string) {
    return this.vdclAdmin.getAgreement(id);
  }

  /** Countersign a version and make it the agreement's active one. */
  @Post('versions/:id/activate')
  activateVersion(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.vdclAdmin.activateVersion(id, req.user.sub);
  }

  @Post('versions/:id/suspend')
  suspendVersion(
    @Param('id') id: string,
    @Body() dto: VdclReasonDto,
    @Req() req: AuthedRequest,
  ) {
    return this.vdclAdmin.suspendVersion(id, req.user.sub, dto.reason);
  }

  @Post('versions/:id/reinstate')
  reinstateVersion(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.vdclAdmin.reinstateVersion(id, req.user.sub);
  }

  /**
   * Action a contributor's withdrawal request. Withdrawal is the
   * CONTRIBUTOR's decision -- this exists to action one received
   * off-platform until the contributor control ships in Phase 3. To revoke
   * a licence on Dialect Library's own initiative, use suspend.
   */
  @Post('agreements/:id/withdraw')
  withdrawAgreement(
    @Param('id') id: string,
    @Body() dto: VdclReasonDto,
    @Req() req: AuthedRequest,
  ) {
    return this.vdclAdmin.withdrawAgreement(id, req.user.sub, dto.reason);
  }
}
