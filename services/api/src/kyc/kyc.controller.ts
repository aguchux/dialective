import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { KycStatus } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@dialectiva/db';
import { KycService } from './kyc.service';
import { SelfHostedKycService } from './self-hosted-kyc.service';
import { KycEvidenceRedactionService } from './kyc-evidence-redaction.service';
import { StorageService } from '../storage/storage.service';
import { AdminDeclineKycDto, AdminListKycDto } from './dto/admin-list-kyc.dto';
import {
  CreateKycEvidenceUploadUrlDto,
  ResumeSelfHostedKycDto,
  SubmitKycDocumentDto,
  SubmitKycSelfieDto,
} from './dto/self-hosted-kyc.dto';
import { verifyKycHandoffToken } from './self-hosted-kyc-handoff.util';

@Controller()
export class KycController {
  constructor(
    private readonly kyc: KycService,
    private readonly selfHosted: SelfHostedKycService,
    private readonly redaction: KycEvidenceRedactionService,
    private readonly storage: StorageService,
  ) {}

  @Post('kyc/session')
  @UseGuards(JwtAuthGuard)
  createSession(@Req() req: AuthenticatedRequest) {
    const frontend = process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
    const callbackUrl = new URL('/dashboard?view=tokens&kyc=complete', frontend).toString();
    return this.kyc.createVerificationSession(req.user.sub, callbackUrl);
  }

  @Get('kyc/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.kyc.getMyStatus(req.user.sub);
  }

  @Post('kyc/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() req: AuthenticatedRequest) {
    return this.kyc.cancelMyVerification(req.user.sub);
  }

  /**
   * No JwtAuthGuard -- Didit can't send a JWT, trust comes from
   * verifyWebhookSignature instead (see didit.service.ts's doc comment on
   * the three header schemes it checks). Needs the raw request body
   * (main.ts's `rawBody: true`), same as wallet.controller.ts's Flutterwave
   * webhook handler, since two of Didit's three signature schemes are
   * computed over raw/re-sorted bytes rather than the parsed body.
   */
  @Post('kyc/webhooks/didit')
  async handleWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw request body');
    }
    const headers: Record<string, string | undefined> = {
      'x-signature-v2': req.headers['x-signature-v2'] as string | undefined,
      'x-signature': req.headers['x-signature'] as string | undefined,
      'x-signature-simple': req.headers['x-signature-simple'] as string | undefined,
      'x-timestamp': req.headers['x-timestamp'] as string | undefined,
    };
    const body = req.body as {
      session_id?: string;
      status?: string;
      webhook_type?: string;
      decision?: Record<string, unknown>;
    };
    return this.kyc.handleWebhook(body, rawBody, headers);
  }

  /**
   * The DLKYC app (kyc.dialectlibrary.com) is a separate origin with no
   * access to the platform's normal session/cookies, so it authenticates
   * every call with the short-lived handoff token instead of JwtAuthGuard
   * -- see self-hosted-kyc-handoff.util.ts's doc comment. Each request
   * carries the token in its body (not a header) purely so the DTO shapes
   * stay symmetric with the rest of this controller's POST routes; there is
   * no CSRF concern since the token itself is the credential and is never
   * stored in a cookie.
   */
  @Post('kyc/self/resume')
  resumeSelfHosted(@Body() body: ResumeSelfHostedKycDto) {
    return this.selfHosted.resumeSession(body.token);
  }

  @Post('kyc/self/verifications/:verificationId/challenge')
  getSelfHostedChallenge(
    @Param('verificationId') verificationId: string,
    @Body() body: ResumeSelfHostedKycDto,
  ) {
    const claims = this.verifyHandoffOwnership(body.token, verificationId);
    return this.selfHosted.getChallenge(verificationId, claims.sub);
  }

  @Post('kyc/self/verifications/:verificationId/document-upload-url')
  createSelfHostedDocumentUploadUrl(
    @Param('verificationId') verificationId: string,
    @Body() body: CreateKycEvidenceUploadUrlDto,
  ) {
    const claims = this.verifyHandoffOwnership(body.token, verificationId);
    return this.selfHosted.createEvidenceUploadUrl(
      verificationId,
      claims.sub,
      body.contentType,
      'document',
    );
  }

  @Post('kyc/self/verifications/:verificationId/document')
  submitSelfHostedDocument(
    @Param('verificationId') verificationId: string,
    @Body() body: SubmitKycDocumentDto,
  ) {
    const claims = this.verifyHandoffOwnership(body.token, verificationId);
    return this.selfHosted.submitDocument(verificationId, claims.sub, body);
  }

  @Post('kyc/self/verifications/:verificationId/selfie-upload-url')
  createSelfHostedSelfieUploadUrl(
    @Param('verificationId') verificationId: string,
    @Body() body: CreateKycEvidenceUploadUrlDto,
  ) {
    const claims = this.verifyHandoffOwnership(body.token, verificationId);
    return this.selfHosted.createEvidenceUploadUrl(
      verificationId,
      claims.sub,
      body.contentType,
      'selfie',
    );
  }

  @Post('kyc/self/verifications/:verificationId/selfie')
  submitSelfHostedSelfie(
    @Param('verificationId') verificationId: string,
    @Body() body: SubmitKycSelfieDto,
  ) {
    const claims = this.verifyHandoffOwnership(body.token, verificationId);
    return this.selfHosted.submitSelfie(verificationId, claims.sub, body);
  }

  @Post('kyc/self/verifications/:verificationId/submit')
  submitSelfHosted(
    @Param('verificationId') verificationId: string,
    @Body() body: ResumeSelfHostedKycDto,
  ) {
    const claims = this.verifyHandoffOwnership(body.token, verificationId);
    return this.kyc.submitSelfHostedVerification(verificationId, claims.sub);
  }

  private verifyHandoffOwnership(token: string, verificationId: string) {
    let claims;
    try {
      claims = verifyKycHandoffToken(token);
    } catch {
      throw new UnauthorizedException('This verification link has expired. Please start again.');
    }
    if (claims.verificationId !== verificationId) {
      throw new UnauthorizedException('Token does not match this verification session');
    }
    return claims;
  }

  @Get('admin/kyc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminList(@Query() query: AdminListKycDto) {
    return this.kyc.adminList({
      status: query.status as KycStatus | undefined,
      search: query.search,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  @Get('admin/kyc/recheck/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  recheckPreview() {
    return this.kyc.recheckSelfHosted(true);
  }

  @Post('admin/kyc/recheck/run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  recheckRun() {
    return this.kyc.recheckSelfHosted(false);
  }

  @Get('admin/kyc/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminGet(@Param('id') id: string) {
    return this.kyc.adminGet(id);
  }

  /** Decrypts and returns the raw decision payload -- see kyc.service.ts's adminGetDecision doc comment. Every call is logged server-side. */
  @Get('admin/kyc/:id/decision')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminGetDecision(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.kyc.adminGetDecision(id, req.user.sub);
  }

  /** Metadata only (id/kind/capturedAt) -- never bucket/key, see kyc.service.ts's adminListEvidence doc comment. Used by the admin detail dialog to render one "View" button per captured image. */
  @Get('admin/kyc/:id/evidence')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminListEvidence(@Param('id') id: string) {
    return this.kyc.adminListEvidence(id);
  }

  /**
   * Serves a grayscale, DLKYC-watermarked copy of one captured evidence
   * image -- the raw color original is NEVER served to an admin, only used
   * internally by SelfHostedKycService's face-match/OCR pipeline. See
   * kyc-evidence-redaction.service.ts's class doc comment for the
   * data-protection rationale.
   */
  @Get('admin/kyc/:id/evidence/:evidenceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async adminGetEvidenceImage(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const evidence = await this.kyc.adminGetEvidenceRow(id, evidenceId);
    const raw = await this.storage.getObjectBuffer(evidence.bucket, evidence.key);
    const redacted = await this.redaction.toReviewCopy(raw);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(redacted);
  }

  @Post('admin/kyc/:id/refresh')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminRefresh(@Param('id') id: string) {
    return this.kyc.refreshFromProvider(id);
  }

  @Post('admin/kyc/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminCancel(@Param('id') id: string) {
    return this.kyc.adminCancel(id);
  }

  /** DLKYC-only -- see kyc.service.ts's adminApproveSelfHosted doc comment for why Didit rows are rejected here. */
  @Post('admin/kyc/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminApprove(@Param('id') id: string) {
    return this.kyc.adminApproveSelfHosted(id);
  }

  @Post('admin/kyc/:id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminDecline(@Param('id') id: string, @Body() body: AdminDeclineKycDto) {
    return this.kyc.adminDeclineSelfHosted(id, body.reason);
  }

  /** Reverses a previously-APPROVED verification (either provider) back to DECLINED -- see kyc.service.ts's adminRevokeVerification doc comment. */
  @Post('admin/kyc/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminRevoke(@Param('id') id: string, @Body() body: AdminDeclineKycDto) {
    return this.kyc.adminRevokeVerification(id, body.reason);
  }
}
