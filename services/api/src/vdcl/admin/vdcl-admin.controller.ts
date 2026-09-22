import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { VdclAdminService } from './vdcl-admin.service';
import {
  CountersignVdclDto,
  ListVdclAgreementsDto,
  VdclReasonDto,
} from './dto/vdcl-lifecycle.dto';
import { VdclDocumentsService } from '../documents/vdcl-documents.service';

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
  constructor(
    private readonly vdclAdmin: VdclAdminService,
    private readonly documents: VdclDocumentsService,
  ) {}

  @Get('agreements')
  listAgreements(@Query() query: ListVdclAgreementsDto) {
    return this.vdclAdmin.listAgreements(query);
  }

  @Get('agreements/:id')
  getAgreement(@Param('id') id: string) {
    return this.vdclAdmin.getAgreement(id);
  }

  /**
   * Issue the step-up code for a countersignature, to the admin's own
   * verified destination. Bound to this version AND its manifest hash.
   */
  @Post('versions/:id/countersign-otp')
  requestCountersignOtp(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.vdclAdmin.requestCountersignOtp(id, req.user.sub);
  }

  /**
   * Countersign a version and make it the agreement's active one.
   *
   * This is the moment a licence starts granting rights over a real
   * person's voice, so it carries an OTP step-up like every other
   * consequential admin action here.
   */
  @Post('versions/:id/activate')
  activateVersion(
    @Param('id') id: string,
    @Body() dto: CountersignVdclDto,
    @Req() req: AuthedRequest,
  ) {
    return this.vdclAdmin.activateVersion(id, req.user.sub, dto);
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
  /**
   * Re-render and re-store a version's documents.
   *
   * Documents are issued automatically at countersignature; this exists for
   * the case where that render failed (a network blip during upload leaves
   * pdfKey null) or where a template fix needs applying to an already-issued
   * licence. It rewrites the stored hashes, so a re-issue is visible as a
   * changed hash rather than a silent swap.
   */
  @Post('versions/:id/reissue-documents')
  reissueDocuments(@Param('id') id: string) {
    return this.documents.issueDocuments(id);
  }

  /** Staff copy of a licence document, for support and compliance. */
  @Get('versions/:id/documents/:kind')
  downloadDocument(
    @Param('id') id: string,
    @Param('kind') kind: 'pdf' | 'png',
    @Req() req: AuthedRequest,
  ) {
    return this.documents.getDownloadUrl({
      versionId: id,
      kind: kind === 'png' ? 'png' : 'pdf',
      requesterId: req.user.sub,
      isStaff: true,
    });
  }

  @Post('agreements/:id/withdraw')
  withdrawAgreement(
    @Param('id') id: string,
    @Body() dto: VdclReasonDto,
    @Req() req: AuthedRequest,
  ) {
    return this.vdclAdmin.withdrawAgreement(id, req.user.sub, dto.reason);
  }
}
