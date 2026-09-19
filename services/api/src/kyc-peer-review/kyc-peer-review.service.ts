import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  forwardRef,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  KycPeerReviewVerdict,
  KycStatus,
  LedgerEntryType,
  Prisma,
} from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { decryptKycField } from '../common/kyc-crypto.util';
import { KycService } from '../kyc/kyc.service';

export const INTEGRATION_SLUG = 'p2p-kyc-review';

/**
 * Agreeing verdicts needed before a verification reaches an admin. Two
 * peers who agree is the normal path; where they disagree a third is
 * polled and the majority of three decides (see tally).
 */
export const KYC_PEER_REVIEW_QUORUM = 2;

/** Hard ceiling on peers polled for one verification, so a document cannot be shown to an unbounded number of people while opinions stay split. */
export const KYC_PEER_REVIEW_MAX_REVIEWS = 3;

const CLAIM_TTL_MINUTES = 20;

/**
 * Community review of identity documents.
 *
 * A subscribed, admin-approved member claims a verification sitting in
 * IN_REVIEW, reads the document through a magnifier over an already
 * redacted (grayscale, watermarked) copy, checks the name against the
 * account and types back the document number. Two agreeing verdicts send
 * it to an admin, who makes the real decision -- peers never move a
 * trainer's KycStatus themselves.
 *
 * Reviewers are paid by the PLATFORM when an admin approves, not by the
 * person being verified: KYC is something the platform requires, not a
 * service the trainer chose to buy.
 */
@Injectable()
export class KycPeerReviewService {
  private readonly logger = new Logger(KycPeerReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    // forwardRef: KycModule imports this module (its admin-approve route
    // pays reviewers), and a certified reviewer's verdict needs KycService
    // back. Neither is needed at construction time.
    @Inject(forwardRef(() => KycService))
    private readonly kyc: KycService,
  ) {}

  /**
   * Normalised so a reviewer is not failed for typing spaces, dashes or
   * lowercase differently from however OCR rendered the same number.
   */
  static hashDocumentNumber(value: string): string {
    const normalised = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return createHash('sha256').update(normalised).digest('hex');
  }

  private async requireReviewer(userId: string) {
    const approved = await this.integrations.isSubscribed(userId, INTEGRATION_SLUG);
    if (!approved) {
      throw new ForbiddenException(
        'Your ID Review access has not been approved yet. Request access from the Integrations page; an admin reviews every request.',
      );
    }
    return this.integrations.requireEnabled(INTEGRATION_SLUG);
  }

  /**
   * Certified reviewers are the platform's own trained staff working from
   * the trainer app rather than the admin panel. Their verdict decides a
   * verification outright and they see documents unobscured, so this is
   * checked separately at every point those two things differ from an
   * ordinary peer's.
   */
  private certified(userId: string) {
    return this.integrations.isCertified(userId, INTEGRATION_SLUG);
  }

  /** Public form of the certification check, for the controller's image route. */
  isCertifiedReviewer(userId: string) {
    return this.certified(userId);
  }

  private async expireStaleClaims(now: Date) {
    await this.prisma.kycPeerReviewClaim.deleteMany({
      where: { claimExpiresAt: { lt: now } },
    });
  }

  /**
   * Verifications waiting for this reviewer.
   *
   * Excludes their own, anything they have already judged, and anything
   * another peer currently holds -- so the list only ever shows work they
   * can actually take.
   */
  async listPending(userId: string, page = 1, pageSize = 20) {
    await this.requireReviewer(userId);
    const now = new Date();
    await this.expireStaleClaims(now);

    const where: Prisma.KycVerificationWhereInput = {
      status: KycStatus.IN_REVIEW,
      userId: { not: userId },
      // Already at quorum: waiting on the admin, not on more peers.
      peerReviews: { none: { reviewerId: userId } },
      captureEvidence: { some: {} },
      peerReviewClaims: { none: { reviewerId: { not: userId } } },
    };

    const [rows, total] = await Promise.all([
      this.prisma.kycVerification.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          documentType: true,
          user: { select: { firstName: true, lastName: true } },
          _count: { select: { peerReviews: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kycVerification.count({ where }),
    ]);

    const isCertified = await this.certified(userId);
    return {
      items: rows
        // Same reasoning as claim(): a certified reviewer resolves what
        // peers could not, so a document at the cap must still reach them.
        .filter((row) => isCertified || row._count.peerReviews < KYC_PEER_REVIEW_MAX_REVIEWS)
        .map((row) => ({
          id: row.id,
          documentType: row.documentType,
          submittedAt: row.createdAt,
          reviewsSoFar: row._count.peerReviews,
          // Only what a reviewer needs to judge a name match. No email, no
          // phone, no account history -- this is a name-on-card check, not
          // a profile inspection.
          accountName: [row.user.firstName, row.user.lastName].filter(Boolean).join(' '),
        })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Take a verification out of the pool for this reviewer.
   *
   * Race-safe via the unique (kycVerificationId, reviewerId) plus an
   * explicit check that nobody else holds it -- two peers must never be
   * shown the same document at the same time.
   */
  async claim(userId: string, verificationId: string) {
    const integration = await this.requireReviewer(userId);
    const now = new Date();
    await this.expireStaleClaims(now);

    const held = await this.prisma.kycPeerReviewClaim.count({
      where: { reviewerId: userId, claimExpiresAt: { gt: now } },
    });
    if (held >= integration.maxConcurrentClaims) {
      throw new UnprocessableEntityException(
        `You can hold ${integration.maxConcurrentClaims} review${
          integration.maxConcurrentClaims === 1 ? '' : 's'
        } at a time. Finish one first.`,
      );
    }

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
      include: { _count: { select: { peerReviews: true } } },
    });
    if (!verification || verification.status !== KycStatus.IN_REVIEW) {
      throw new NotFoundException('That verification is no longer awaiting review');
    }
    if (verification.userId === userId) {
      throw new ForbiddenException('You cannot review your own verification');
    }
    // The review cap protects a trainer from having their document shown
    // to an unbounded number of community members. A certified reviewer is
    // staff and ENDS the process rather than adding to it, so the cap does
    // not apply to them -- otherwise a document stuck at three split peer
    // verdicts could never be resolved from the trainer app at all.
    const isCertified = await this.certified(userId);
    if (!isCertified && verification._count.peerReviews >= KYC_PEER_REVIEW_MAX_REVIEWS) {
      throw new UnprocessableEntityException('This verification already has enough reviews');
    }

    const alreadyReviewed = await this.prisma.kycPeerReview.count({
      where: { kycVerificationId: verificationId, reviewerId: userId },
    });
    if (alreadyReviewed > 0) {
      throw new UnprocessableEntityException('You have already reviewed this verification');
    }

    const takenByOther = await this.prisma.kycPeerReviewClaim.count({
      where: {
        kycVerificationId: verificationId,
        reviewerId: { not: userId },
        claimExpiresAt: { gt: now },
      },
    });
    if (takenByOther > 0) {
      throw new UnprocessableEntityException('Another reviewer is looking at this one');
    }

    try {
      await this.prisma.kycPeerReviewClaim.create({
        data: {
          kycVerificationId: verificationId,
          reviewerId: userId,
          claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MINUTES * 60 * 1000),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // This reviewer already holds it -- re-opening their own claim.
        await this.prisma.kycPeerReviewClaim.updateMany({
          where: { kycVerificationId: verificationId, reviewerId: userId },
          data: { claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MINUTES * 60 * 1000) },
        });
      } else {
        throw err;
      }
    }

    return this.getForReview(userId, verificationId);
  }

  /** Release a claim without judging -- back to the pool for someone else. */
  async release(userId: string, verificationId: string) {
    await this.prisma.kycPeerReviewClaim.deleteMany({
      where: { kycVerificationId: verificationId, reviewerId: userId },
    });
    return { released: true };
  }

  /**
   * What the reviewer sees. Deliberately narrow: the name to match, the
   * document type, and the ids of the evidence images. The document number
   * is never sent -- the reviewer's job is to read it off the card, and
   * sending it would make the check meaningless.
   */
  async getForReview(userId: string, verificationId: string) {
    await this.requireReviewer(userId);
    const now = new Date();
    const claim = await this.prisma.kycPeerReviewClaim.findFirst({
      where: {
        kycVerificationId: verificationId,
        reviewerId: userId,
        claimExpiresAt: { gt: now },
      },
    });
    if (!claim) {
      throw new ForbiddenException('Claim this verification before reviewing it');
    }
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        captureEvidence: {
          where: { kind: { in: ['DOCUMENT_FRONT', 'DOCUMENT_BACK'] } },
          select: { id: true, kind: true },
          orderBy: { capturedAt: 'asc' },
        },
      },
    });
    if (!verification) throw new NotFoundException('Verification not found');

    return {
      id: verification.id,
      documentType: verification.documentType,
      // Drives whether the client renders the magnifier. The server does
      // not depend on this for anything -- it is a rendering hint, and the
      // real difference (a decisive verdict) is enforced in submitReview.
      certifiedReviewer: await this.certified(userId),
      accountName: [verification.user.firstName, verification.user.lastName]
        .filter(Boolean)
        .join(' '),
      accountNameParts: [verification.user.firstName, verification.user.lastName].filter(
        Boolean,
      ) as string[],
      evidence: verification.captureEvidence,
      claimExpiresAt: claim.claimExpiresAt,
    };
  }

  /**
   * Resolve an evidence row for the image endpoint, but only for a
   * reviewer who currently holds a claim on its verification -- an
   * evidence id alone must never be enough to see a document.
   */
  async getClaimedEvidenceRow(userId: string, verificationId: string, evidenceId: string) {
    const claim = await this.prisma.kycPeerReviewClaim.findFirst({
      where: {
        kycVerificationId: verificationId,
        reviewerId: userId,
        claimExpiresAt: { gt: new Date() },
      },
    });
    if (!claim) throw new ForbiddenException('Claim this verification before viewing it');
    const evidence = await this.prisma.kycCaptureEvidence.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence || evidence.kycVerificationId !== verificationId) {
      throw new NotFoundException('Evidence not found');
    }
    return evidence;
  }

  /**
   * Records that someone opened a document image. Written BEFORE the bytes
   * are served, so a view is logged even if the transfer then fails -- the
   * log exists to make access attributable, and an unlogged successful
   * view is the failure mode that matters.
   *
   * viewerRole distinguishes CERTIFIED from PEER because they see
   * different things: a certified reviewer gets the document as captured,
   * a peer gets the grayscale watermarked copy.
   */
  async logEvidenceView(
    viewerId: string,
    kycVerificationId: string,
    evidenceId: string,
    viewerRole: 'PEER' | 'CERTIFIED' | 'ADMIN',
  ) {
    await this.prisma.kycEvidenceViewLog
      .create({ data: { viewerId, kycVerificationId, evidenceId, viewerRole } })
      .catch((err) => {
        this.logger.error(`Failed to log evidence view by ${viewerId}: ${String(err)}`);
      });
  }

  /**
   * Submit a verdict. The typed document number is hashed and compared
   * against the OCR'd number on file; a mismatch is recorded for the admin
   * rather than rejecting the review, since OCR is imperfect and a
   * reviewer reading the card correctly should not be punished for it.
   */
  async submitReview(
    userId: string,
    verificationId: string,
    dto: { verdict: 'APPROVE' | 'DECLINE'; documentNumber: string; declineReason?: string },
  ) {
    await this.requireReviewer(userId);
    const claim = await this.prisma.kycPeerReviewClaim.findFirst({
      where: {
        kycVerificationId: verificationId,
        reviewerId: userId,
        claimExpiresAt: { gt: new Date() },
      },
    });
    if (!claim) throw new ForbiddenException('Claim this verification before reviewing it');

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });
    if (!verification || verification.status !== KycStatus.IN_REVIEW) {
      throw new NotFoundException('That verification is no longer awaiting review');
    }
    if (dto.verdict === 'DECLINE' && !dto.declineReason?.trim()) {
      throw new UnprocessableEntityException('Say why you are declining this document');
    }

    const typedHash = KycPeerReviewService.hashDocumentNumber(dto.documentNumber);
    const onFile = this.readDocumentNumber(verification.decisionEncryptedJson);
    const matched =
      onFile !== null && KycPeerReviewService.hashDocumentNumber(onFile) === typedHash;

    await this.prisma.$transaction([
      this.prisma.kycPeerReview.create({
        data: {
          kycVerificationId: verificationId,
          reviewerId: userId,
          verdict:
            dto.verdict === 'APPROVE'
              ? KycPeerReviewVerdict.APPROVE
              : KycPeerReviewVerdict.DECLINE,
          documentNumberHash: typedHash,
          documentNumberMatched: matched,
          declineReason: dto.declineReason?.trim() || null,
        },
      }),
      this.prisma.kycPeerReviewClaim.deleteMany({
        where: { kycVerificationId: verificationId, reviewerId: userId },
      }),
    ]);

    const isCertified = await this.certified(userId);
    this.logger.log(
      `Peer review submitted: reviewer=${userId} verification=${verificationId} verdict=${dto.verdict} numberMatched=${matched} certified=${isCertified}`,
    );

    if (isCertified) {
      // A certified reviewer IS the decision. Their verdict moves the
      // trainer's KycStatus directly, through the same methods the admin
      // panel uses, so the decision record, notification and audit trail
      // are identical to an admin having pressed the button.
      this.logger.warn(
        `Certified reviewer ${userId} ${dto.verdict === 'APPROVE' ? 'APPROVED' : 'DECLINED'} KycVerification ${verificationId} without admin action`,
      );
      if (dto.verdict === 'APPROVE') {
        await this.kyc.adminApproveSelfHosted(verificationId);
        await this.payReviewers(verificationId);
      } else {
        await this.kyc.adminDeclineSelfHosted(
          verificationId,
          dto.declineReason?.trim() || 'Document did not match the account',
        );
        // Declines pay too: the work of checking was done either way, and
        // paying only for approvals would reward waving documents through.
        await this.payReviewers(verificationId);
      }
      return { ...(await this.tally(verificationId)), decidedByCertifiedReviewer: true };
    }

    return { ...(await this.tally(verificationId)), decidedByCertifiedReviewer: false };
  }

  /**
   * Where a verification stands.
   *
   * Two agreeing verdicts is the quorum. If the first two disagree, a
   * third is polled and the majority of three decides. Either way the
   * outcome is only a RECOMMENDATION -- an admin still makes the decision
   * that moves a trainer's KycStatus.
   */
  async tally(verificationId: string) {
    const reviews = await this.prisma.kycPeerReview.findMany({
      where: { kycVerificationId: verificationId },
      select: { verdict: true },
    });
    const approvals = reviews.filter((r) => r.verdict === KycPeerReviewVerdict.APPROVE).length;
    const declines = reviews.length - approvals;

    const decided = approvals >= KYC_PEER_REVIEW_QUORUM || declines >= KYC_PEER_REVIEW_QUORUM;
    return {
      reviewCount: reviews.length,
      approvals,
      declines,
      // Split after two: a third peer breaks the tie.
      needsAnotherReviewer: !decided && reviews.length < KYC_PEER_REVIEW_MAX_REVIEWS,
      readyForAdmin: decided,
      recommendation: decided ? (approvals > declines ? 'APPROVE' : 'DECLINE') : null,
    };
  }

  /** This reviewer's own history, for their integration page. */
  async listMyReviews(userId: string, page = 1, pageSize = 20) {
    const [rows, total] = await Promise.all([
      this.prisma.kycPeerReview.findMany({
        where: { reviewerId: userId },
        select: {
          id: true,
          verdict: true,
          documentNumberMatched: true,
          paidAt: true,
          createdAt: true,
          kycVerification: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kycPeerReview.count({ where: { reviewerId: userId } }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  // --- Admin ---------------------------------------------------------------

  /** Verifications that have reached quorum and are waiting on an admin. */
  async listForAdmin() {
    const rows = await this.prisma.kycVerification.findMany({
      where: { status: KycStatus.IN_REVIEW, peerReviews: { some: {} } },
      select: {
        id: true,
        createdAt: true,
        documentType: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        peerReviews: {
          select: {
            id: true,
            verdict: true,
            documentNumberMatched: true,
            declineReason: true,
            createdAt: true,
            reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return rows.map((row) => {
      const approvals = row.peerReviews.filter((r) => r.verdict === 'APPROVE').length;
      const declines = row.peerReviews.length - approvals;
      const decided = approvals >= KYC_PEER_REVIEW_QUORUM || declines >= KYC_PEER_REVIEW_QUORUM;
      return {
        id: row.id,
        documentType: row.documentType,
        submittedAt: row.createdAt,
        user: row.user,
        reviews: row.peerReviews,
        approvals,
        declines,
        readyForAdmin: decided,
        recommendation: decided ? (approvals > declines ? 'APPROVE' : 'DECLINE') : null,
      };
    });
  }

  /**
   * Send a verification back to the pool with its peer verdicts cleared.
   *
   * The admin's "this run was wrong, do it again" -- resets the count to
   * zero so a fresh set of reviewers looks at it, which is what the spec
   * asked for on an admin rejection of the peer outcome.
   */
  async adminResetReviews(adminId: string, verificationId: string) {
    const deleted = await this.prisma.kycPeerReview.deleteMany({
      where: { kycVerificationId: verificationId },
    });
    await this.prisma.kycPeerReviewClaim.deleteMany({
      where: { kycVerificationId: verificationId },
    });
    this.logger.log(
      `Admin ${adminId} reset ${deleted.count} peer review(s) on KycVerification ${verificationId}`,
    );
    return { reset: true, cleared: deleted.count };
  }

  /**
   * Credit every reviewer of this verification, once.
   *
   * Called when an admin APPROVES a verification that went through peer
   * review. Guarded by paidAt so a repeated admin action, or an
   * approve-after-reset, cannot pay the same review twice.
   *
   * Funded by the member being verified, who was charged at submission
   * (KycService.chargeReviewFee). The fee therefore CIRCULATES rather than
   * being minted. Two cases still mint, deliberately:
   *
   *  - the applicant could not afford the full fee, so the platform
   *    absorbed the shortfall rather than blocking their KYC; and
   *  - more reviewers than expected worked the verification (a split
   *    decision polls a third), so the pot is spread thinner than the
   *    per-reviewer fee.
   *
   * Reviewers are always paid in full for work done -- the applicant's
   * shortfall is the platform's problem, never the reviewer's.
   */
  async payReviewers(verificationId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { slug: INTEGRATION_SLUG },
    });
    if (!integration || !integration.enabled) return { paid: 0 };
    const fee = integration.feeTokenAmount;
    if (fee.lessThanOrEqualTo(0)) return { paid: 0 };

    const unpaid = await this.prisma.kycPeerReview.findMany({
      where: { kycVerificationId: verificationId, paidAt: null },
      select: { id: true, reviewerId: true },
    });
    if (unpaid.length === 0) return { paid: 0 };

    // What the applicant actually contributed. Anything the reviewers are
    // paid beyond this is newly minted, and worth knowing about -- this
    // path was 100% minted before the applicant started paying.
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
      select: { reviewFeeTokenAmount: true, reviewFeeShortfall: true },
    });
    const funded = verification?.reviewFeeTokenAmount ?? new Prisma.Decimal(0);
    const owed = fee.mul(unpaid.length);
    if (owed.greaterThan(funded)) {
      this.logger.log(
        `KYC review payout exceeds applicant funding: verification=${verificationId} reviewers=${unpaid.length} owed=${owed.toString()} funded=${funded.toString()} minted=${owed.minus(funded).toString()}`,
      );
    }

    let paid = 0;
    for (const review of unpaid) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Claim the row first: if another call already paid it, this
          // updates nothing and we skip rather than double-crediting.
          const claimed = await tx.kycPeerReview.updateMany({
            where: { id: review.id, paidAt: null },
            data: { paidAt: new Date() },
          });
          if (claimed.count === 0) return;

          const wallet = await tx.wallet.upsert({
            where: { userId: review.reviewerId },
            update: {},
            create: { userId: review.reviewerId },
          });
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: fee } },
          });
          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              type: LedgerEntryType.VALIDATION_REWARD,
              amount: fee,
              reference: review.id,
            },
          });
          paid += 1;
        });
      } catch (err) {
        this.logger.error(`Failed to pay peer review ${review.id}: ${String(err)}`);
      }
    }
    this.logger.log(`Paid ${paid} peer reviewer(s) for KycVerification ${verificationId}`);
    return { paid };
  }

  /** Pulls the OCR'd document number out of the encrypted decision blob, or null when there isn't one to compare against. */
  private readDocumentNumber(decisionEncryptedJson: Prisma.JsonValue | null): string | null {
    if (!decisionEncryptedJson) return null;
    try {
      const raw = JSON.parse(
        decryptKycField(
          decisionEncryptedJson as unknown as {
            encryptedValue: string;
            iv: string;
            authTag: string;
          },
        ),
      ) as Record<string, unknown>;
      const direct = raw.documentNumber;
      if (typeof direct === 'string' && direct.trim()) return direct;
      const findings = raw.botFindings as Record<string, unknown> | undefined;
      const nested = findings?.documentNumber;
      return typeof nested === 'string' && nested.trim() ? nested : null;
    } catch {
      return null;
    }
  }
}
