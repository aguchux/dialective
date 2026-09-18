import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StorageService } from '../storage/storage.service';
import { KycEvidenceRedactionService } from '../kyc/kyc-evidence-redaction.service';
import { KycPeerReviewService } from './kyc-peer-review.service';
import { ListPeerReviewQueueDto, SubmitPeerReviewDto } from './dto/kyc-peer-review.dto';

@Controller('kyc-peer-review')
@UseGuards(JwtAuthGuard)
export class KycPeerReviewController {
  constructor(
    private readonly peerReview: KycPeerReviewService,
    private readonly storage: StorageService,
    private readonly redaction: KycEvidenceRedactionService,
  ) {}

  @Get('queue')
  listQueue(@Req() req: AuthenticatedRequest, @Query() query: ListPeerReviewQueueDto) {
    return this.peerReview.listPending(req.user.sub, query.page, query.pageSize);
  }

  @Get('mine')
  listMine(@Req() req: AuthenticatedRequest, @Query() query: ListPeerReviewQueueDto) {
    return this.peerReview.listMyReviews(req.user.sub, query.page, query.pageSize);
  }

  // --- Admin ---------------------------------------------------------------
  //
  // Declared BEFORE the ':id' routes below: Nest matches in declaration
  // order, so 'admin/queue' would otherwise be swallowed by '@Get(":id")'
  // with id="admin".

  @Get('admin/queue')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminQueue() {
    return this.peerReview.listForAdmin();
  }

  /** Clears a verification's peer verdicts and returns it to the pool for a fresh run. */
  @Post('admin/:id/reset')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminReset(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.peerReview.adminResetReviews(req.user.sub, id);
  }

  @Post(':id/claim')
  claim(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.peerReview.claim(req.user.sub, id);
  }

  @Post(':id/release')
  release(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.peerReview.release(req.user.sub, id);
  }

  @Get(':id')
  getForReview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.peerReview.getForReview(req.user.sub, id);
  }

  /**
   * The document image a reviewer actually sees: the same grayscale,
   * watermarked copy an admin gets, never the raw colour original.
   *
   * Access needs a live claim on this verification, so an evidence id on
   * its own is never enough. Every view is logged before the bytes go out.
   */
  @Get(':id/evidence/:evidenceId')
  async getEvidenceImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const evidence = await this.peerReview.getClaimedEvidenceRow(req.user.sub, id, evidenceId);
    await this.peerReview.logEvidenceView(req.user.sub, id, evidenceId, 'PEER');
    const raw = await this.storage.getObjectBuffer(evidence.bucket, evidence.key);
    const redacted = await this.redaction.toReviewCopy(raw);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(redacted);
  }

  @Post(':id/review')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitPeerReviewDto,
  ) {
    return this.peerReview.submitReview(req.user.sub, id, body);
  }

}
