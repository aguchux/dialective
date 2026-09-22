import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { VdclReadinessService } from './readiness.service';
import { VdclMakerService } from './vdcl-maker.service';
import { VdclSigningService } from './vdcl-signing.service';
import { CompilationTrackerService } from './compilation-tracker.service';
import { VdclDocumentsService } from '../documents/vdcl-documents.service';
import { SignVdclVersionDto, StartVdclDraftDto } from './dto/maker.dto';

interface AuthedRequest {
  user: { sub: string };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

function clientEvidence(req: AuthedRequest) {
  const ua = req.headers['user-agent'];
  return {
    ipAddress: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

/**
 * The contributor-facing VDCL Maker.
 *
 * Every route derives the contributor from the JWT. None accepts a
 * contributor id, a dialect or an agreement id from the request body --
 * a licence is a statement about a specific person's own recordings, and
 * letting any of those be supplied would turn ownership into an input.
 *
 * Contributor-facing means it is on the other side of the anonymity
 * boundary from the subscriber surfaces: nothing here reveals which
 * organizations hold or stream a contributor's work.
 */
@Controller('vdcl')
@UseGuards(JwtAuthGuard)
export class VdclMakerController {
  constructor(
    private readonly readiness: VdclReadinessService,
    private readonly maker: VdclMakerService,
    private readonly signing: VdclSigningService,
    private readonly tracker: CompilationTrackerService,
    private readonly documents: VdclDocumentsService,
  ) {}

  /** Stage 1: can this contributor sign, and what would a licence cover? */
  @Get('readiness')
  check(@Req() req: AuthedRequest) {
    return this.readiness.check(req.user.sub);
  }

  /** Every licence version this contributor has, newest first. */
  @Get('versions')
  listVersions(@Req() req: AuthedRequest) {
    return this.tracker.listForContributor(req.user.sub);
  }

  /** Stages 2-4: create the draft with its consent grants, then compile. */
  @Post('drafts')
  startDraft(@Body() dto: StartVdclDraftDto, @Req() req: AuthedRequest) {
    return this.maker.startDraft({
      contributorId: req.user.sub,
      purposes: dto.purposes,
      wordingVersion: dto.wordingVersion,
      termsVersion: dto.termsVersion,
      locale: dto.locale,
      ...clientEvidence(req),
    });
  }

  /** Stage 5: the exact manifest and permissions about to be signed. */
  @Get('versions/:id/review')
  review(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.signing.getForReview(id, req.user.sub);
  }

  /** Stage 7: real pipeline status -- which stage, whose move, what blocks it. */
  @Get('versions/:id/status')
  status(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.tracker.track(id, req.user.sub);
  }

  /** Stage 6: issue the step-up code, bound to this exact manifest. */
  @Post('versions/:id/signing-otp')
  requestSigningOtp(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.signing.requestSigningOtp(id, req.user.sub);
  }

  /** Stage 6: record the signature. Moves to PENDING_COUNTERSIGNATURE, not ACTIVE. */
  @Post('versions/:id/sign')
  sign(@Param('id') id: string, @Body() dto: SignVdclVersionDto, @Req() req: AuthedRequest) {
    return this.signing.sign({
      versionId: id,
      contributorId: req.user.sub,
      otpRequestId: dto.otpRequestId,
      code: dto.code,
      signatureKind: dto.signatureKind,
      signatureLabel: dto.signatureLabel,
      ...clientEvidence(req),
    });
  }

  /** Stage 6: the signing receipt. */
  @Get('versions/:id/receipt')
  receipt(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.signing.getReceipt(id, req.user.sub);
  }

  /**
   * A short-lived download link for the signed licence PDF.
   *
   * Contributor-only. A subscriber wanting provenance gets the public
   * verification view, never the contributor's own licence.
   */
  @Get('versions/:id/documents/pdf')
  downloadPdf(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.documents.getDownloadUrl({
      versionId: id,
      kind: 'pdf',
      requesterId: req.user.sub,
      isStaff: false,
    });
  }

  /** The PNG certificate -- a portable summary, not the contract. */
  @Get('versions/:id/documents/png')
  downloadPng(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.documents.getDownloadUrl({
      versionId: id,
      kind: 'png',
      requesterId: req.user.sub,
      isStaff: false,
    });
  }

  /** The machine-readable manifest of exactly what this licence covers. */
  @Get('versions/:id/manifest.json')
  jsonManifest(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.documents.getJsonManifest({
      versionId: id,
      requesterId: req.user.sub,
      isStaff: false,
    });
  }

  /** Abandon an unsigned draft. Once signed, the route out is withdrawal. */
  @Delete('versions/:id')
  discard(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.maker.discardDraft(id, req.user.sub);
  }
}
