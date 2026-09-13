import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KycStatus, Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { DiditDecision, DiditService } from './didit.service';
import { SelfHostedKycService } from './self-hosted-kyc.service';
import {
  decryptKycField,
  encryptKycField,
  fingerprintKycDocument,
  maskDocumentNumber,
} from '../common/kyc-crypto.util';

const NON_TERMINAL_STATUSES: KycStatus[] = [
  KycStatus.NOT_STARTED,
  KycStatus.IN_PROGRESS,
  KycStatus.IN_REVIEW,
];

const TERMINAL_STATUSES: KycStatus[] = [
  KycStatus.APPROVED,
  KycStatus.DECLINED,
  KycStatus.ABANDONED,
  KycStatus.EXPIRED,
];

/** Maps Didit's own status vocabulary onto our KycStatus enum -- see didit.service.ts's DiditDecision.status, which passes the raw string through unmodified from their webhook/decision payload. */
const DIDIT_STATUS_MAP: Record<string, KycStatus> = {
  'Not Started': KycStatus.NOT_STARTED,
  'In Progress': KycStatus.IN_PROGRESS,
  'In Review': KycStatus.IN_REVIEW,
  Approved: KycStatus.APPROVED,
  Declined: KycStatus.DECLINED,
  Abandoned: KycStatus.ABANDONED,
  Expired: KycStatus.EXPIRED,
  'Kyc Expired': KycStatus.EXPIRED,
  Resubmitted: KycStatus.IN_PROGRESS,
  'Awaiting User': KycStatus.IN_PROGRESS,
};

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly didit: DiditService,
    private readonly selfHosted: SelfHostedKycService,
    private readonly settings: PlatformSettingsService,
    private readonly mail: MailService,
    @Optional() private readonly sms?: SmsService,
  ) {}

  /**
   * Best-effort decline/revoke notification -- mirrors the pattern in
   * WordsService.checkAuditHoldThreshold: a failed email/SMS send must never
   * unwind the decision that was already applied, so both are fire-and-forget
   * with their own try/catch + logger call.
   */
  private async notifyKycDeclined(userId: string, reason: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        phoneNumber: true,
        phoneVerifiedAt: true,
        smsNotificationsEnabled: true,
      },
    });
    if (!user) return;

    try {
      await this.mail.sendKycDeclinedEmail({ trainerEmail: user.email, reason });
    } catch (err) {
      this.logger.error(`Failed to send KYC decline email for user=${userId}: ${(err as Error).message}`);
    }

    if (this.sms && user.phoneNumber && user.phoneVerifiedAt && user.smsNotificationsEnabled) {
      try {
        await this.sms.sendTransactional(
          user.phoneNumber,
          `Dialect Library: your identity verification was declined. Reason: ${reason}. Please review and resubmit from your dashboard.`,
        );
      } catch (err) {
        this.logger.error(`Failed to send KYC decline SMS for user=${userId}: ${(err as Error).message}`);
      }
    }
  }

  async getActiveProvider(): Promise<'didit' | 'self'> {
    return this.settings.getActiveKycProvider();
  }

  /**
   * Abandons any KycVerification (and its User.kycStatus) that has sat in a
   * non-terminal status for longer than the admin-configured timeout,
   * gated behind kycAutoCancelStaleEnabled -- off by default so no existing
   * in-flight verification is affected until an admin opts in. Marking as
   * ABANDONED (not deleting) frees the trainer to start a fresh session via
   * createVerificationSession, since that method only blocks on
   * kycStatus===APPROVED.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoCancelStaleVerifications(): Promise<void> {
    const { enabled, minutes } = await this.settings.getKycAutoCancelStaleSettings();
    if (!enabled) return;

    const staleBefore = new Date(Date.now() - minutes * 60 * 1000);
    const stale = await this.prisma.kycVerification.findMany({
      where: { status: { in: NON_TERMINAL_STATUSES }, createdAt: { lt: staleBefore } },
      select: { id: true, userId: true },
    });
    if (stale.length === 0) return;

    for (const verification of stale) {
      await this.prisma.kycVerification.update({
        where: { id: verification.id },
        data: {
          status: KycStatus.ABANDONED,
          declineReason: `Auto-cancelled after ${minutes} minutes without completion.`,
        },
      });
      // Only reflect ABANDONED onto User.kycStatus if this user has no
      // OTHER active (non-stale) attempt still in flight -- a user can have
      // more than one KycVerification row (each createVerificationSession
      // call inserts a new one), and a fresher retry shouldn't be clobbered
      // by an older attempt's timeout.
      const stillActive = await this.prisma.kycVerification.findFirst({
        where: {
          userId: verification.userId,
          status: { in: NON_TERMINAL_STATUSES },
          createdAt: { gte: staleBefore },
        },
        select: { id: true },
      });
      if (!stillActive) {
        await this.prisma.user.update({
          where: { id: verification.userId },
          data: { kycStatus: KycStatus.ABANDONED },
        });
      }
    }
    this.logger.log(`Auto-cancelled ${stale.length} stale Didit verification(s)`);
  }

  async createVerificationSession(userId: string, callbackUrl: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { kycStatus: true },
    });
    if (user.kycStatus === KycStatus.APPROVED) {
      throw new BadRequestException('You are already verified');
    }

    const provider = await this.getActiveProvider();
    if (provider === 'self') {
      const { sessionId, kycAppUrl } = await this.selfHosted.createSession(userId, callbackUrl);
      await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.IN_PROGRESS } });
      // SelfHostedKycService.createSession already inserted the
      // KycVerification row (it needs the row's id before the handoff token
      // can be signed) -- unlike the Didit branch below, no upsert needed
      // here since providerSessionId is a freshly generated uuid, never a
      // replay of an existing session.
      return { sessionId, url: kycAppUrl, provider: 'self' as const };
    }

    const session = await this.didit.createSession(userId, callbackUrl);
    // Didit can hand back an already-known session_id for the same
    // vendor_data (e.g. the user re-opens the verification dialog while
    // their prior session is still active, or retries right after cancelling
    // -- Didit may still be holding that session open on its side even
    // though we just marked our row ABANDONED) -- upsert instead of create
    // so that replay doesn't 500 on the providerSessionId unique constraint.
    // The update branch must reset status back to IN_PROGRESS (and clear any
    // prior decline reason) rather than no-op, otherwise a cancel-then-retry
    // that lands on the same Didit session id would leave this row stuck
    // ABANDONED while User.kycStatus below is set back to IN_PROGRESS --
    // the two fall out of sync and cancelMyVerification can no longer find
    // an "active" row to cancel on a subsequent stuck attempt.
    await this.prisma.kycVerification.upsert({
      where: { providerSessionId: session.sessionId },
      create: {
        userId,
        providerSessionId: session.sessionId,
        status: KycStatus.IN_PROGRESS,
      },
      update: {
        status: KycStatus.IN_PROGRESS,
        declineReason: null,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: KycStatus.IN_PROGRESS },
    });
    return { ...session, provider: 'didit' as const };
  }

  /**
   * Lets a trainer escape a DIDIT verification stuck in IN_PROGRESS/IN_REVIEW
   * (Didit never resolved it, and the admin-gated auto-cancel cron above is
   * off by default / has a long timeout) without waiting on an admin.
   * Abandons the user's current non-terminal attempt so createVerificationSession
   * (which only blocks on kycStatus===APPROVED) is immediately unblocked.
   */
  async cancelMyVerification(userId: string) {
    const verification = await this.prisma.kycVerification.findFirst({
      where: { userId, status: { in: NON_TERMINAL_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      // Defensive fallback: User.kycStatus (the denormalized read-cache the
      // dashboard actually renders from) can end up non-terminal with no
      // matching KycVerification row in that state -- e.g. a prior retry
      // landed on a Didit session_id that got upserted without resetting
      // status. Reset the User row directly so the trainer is never stuck
      // with no way out even if the two fell out of sync.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { kycStatus: true },
      });
      if (user && NON_TERMINAL_STATUSES.includes(user.kycStatus)) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { kycStatus: KycStatus.ABANDONED },
        });
        return { cancelled: true };
      }
      throw new NotFoundException('No active verification to cancel');
    }
    await this.abandon(verification.id, userId, 'Cancelled by user to retry verification.');
    return { cancelled: true };
  }

  /**
   * DLKYC (self-hosted) has no external reviewer -- unlike Didit, where the
   * admin queue is oversight-only because Didit's own reviewers make the
   * approve/decline call, a self-hosted IN_REVIEW row has no other path to
   * a terminal decision. Restricted to provider="self" rows: a Didit row
   * always resolves via its webhook or the existing refresh/cancel actions,
   * never via a manual override here. Reuses applyDecision so
   * User.kycStatus/kycVerifiedAt/the duplicate-identity-fingerprint check
   * all apply identically to a manual admin decision.
   */
  async adminApproveSelfHosted(id: string) {
    const verification = await this.getReviewableSelfHostedVerification(id);
    await this.applyDecision(verification.id, verification.userId, KycStatus.APPROVED, {
      status: 'Approved',
      idVerifications: [],
      faceMatchScore: verification.faceMatchScore?.toNumber() ?? null,
      faceMatchStatus: null,
      livenessScore: verification.livenessScore?.toNumber() ?? null,
      livenessStatus: null,
      declineReason: null,
      raw: { provider: 'self', adminOverride: 'approve' },
    });
    return this.prisma.kycVerification.findUniqueOrThrow({ where: { id } });
  }

  async adminDeclineSelfHosted(id: string, reason: string) {
    const verification = await this.getReviewableSelfHostedVerification(id);
    await this.applyDecision(verification.id, verification.userId, KycStatus.DECLINED, {
      status: 'Declined',
      idVerifications: [],
      faceMatchScore: verification.faceMatchScore?.toNumber() ?? null,
      faceMatchStatus: null,
      livenessScore: verification.livenessScore?.toNumber() ?? null,
      livenessStatus: null,
      declineReason: reason,
      raw: { provider: 'self', adminOverride: 'decline', reason },
    });
    await this.notifyKycDeclined(verification.userId, reason);
    return this.prisma.kycVerification.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Reverses a previously-APPROVED verification (either provider) back to
   * DECLINED -- e.g. fraud or a duplicate identity discovered after the
   * fact. Unlike adminApproveSelfHosted/adminDeclineSelfHosted, this is not
   * restricted to provider="self": a Didit-approved user can turn out to be
   * fraudulent just as easily, and Didit's own dashboard has no path to
   * tell this platform to revoke. Reuses applyDecision so User.kycStatus/
   * kycVerifiedAt update identically to every other decision path, and
   * immediately re-blocks the withdrawal/onboarding gates (both check only
   * kycStatus === APPROVED). Also clears diditIdentityFingerprint so the
   * user isn't permanently locked out of ever re-verifying under the
   * duplicate-identity check in applyDecision.
   */
  async adminRevokeVerification(id: string, reason: string) {
    const verification = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.status !== KycStatus.APPROVED) {
      throw new BadRequestException('Only an APPROVED verification can be revoked');
    }
    await this.applyDecision(verification.id, verification.userId, KycStatus.DECLINED, {
      status: 'Declined',
      idVerifications: [],
      faceMatchScore: verification.faceMatchScore?.toNumber() ?? null,
      faceMatchStatus: null,
      livenessScore: verification.livenessScore?.toNumber() ?? null,
      livenessStatus: null,
      declineReason: reason,
      raw: { provider: verification.provider, adminOverride: 'revoke', reason },
    });
    await this.prisma.user.update({
      where: { id: verification.userId },
      data: { diditIdentityFingerprint: null },
    });
    this.logger.warn(`Admin revoked previously-approved KycVerification ${id}: ${reason}`);
    await this.notifyKycDeclined(verification.userId, reason);
    return this.prisma.kycVerification.findUniqueOrThrow({ where: { id } });
  }

  private async getReviewableSelfHostedVerification(id: string) {
    const verification = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.provider !== 'self') {
      throw new BadRequestException(
        'Only self-hosted (DLKYC) verifications can be manually approved or declined here.',
      );
    }
    if (TERMINAL_STATUSES.includes(verification.status)) {
      throw new BadRequestException('This verification is already resolved');
    }
    return verification;
  }

  /** Admin counterpart of cancelMyVerification, for the KYC oversight queue. */
  async adminCancel(id: string) {
    const verification = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!verification) throw new NotFoundException('Verification not found');
    if (TERMINAL_STATUSES.includes(verification.status)) {
      throw new BadRequestException('This verification is already resolved');
    }
    await this.abandon(verification.id, verification.userId, 'Cancelled by admin to allow retry.');
    return this.prisma.kycVerification.findUniqueOrThrow({ where: { id } });
  }

  private async abandon(verificationId: string, userId: string, reason: string) {
    await this.prisma.$transaction([
      this.prisma.kycVerification.update({
        where: { id: verificationId },
        data: { status: KycStatus.ABANDONED, declineReason: reason },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { kycStatus: KycStatus.ABANDONED },
      }),
    ]);
  }

  async getMyStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { kycStatus: true, kycVerifiedAt: true },
    });
    return { kycStatus: user.kycStatus, kycVerifiedAt: user.kycVerifiedAt };
  }

  async handleWebhook(
    payload: {
      session_id?: string;
      status?: string;
      webhook_type?: string;
      decision?: Record<string, unknown>;
    },
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ) {
    if (!this.didit.verifyWebhookSignature(rawBody, headers, payload)) {
      this.logger.warn('Rejected Didit webhook with invalid signature');
      return { received: false };
    }
    const sessionId = payload.session_id;
    if (!sessionId) {
      return { received: true, matched: false };
    }
    const verification = await this.prisma.kycVerification.findUnique({
      where: { providerSessionId: sessionId },
    });
    if (!verification) {
      this.logger.warn(`Didit webhook for unknown session ${sessionId}`);
      return { received: true, matched: false };
    }
    // Idempotency: a resolved (terminal) status is never overwritten by a
    // stale/replayed webhook -- once APPROVED/DECLINED/ABANDONED/EXPIRED,
    // further deliveries for the same session are safe no-ops.
    if (TERMINAL_STATUSES.includes(verification.status)) {
      return { received: true, duplicate: true };
    }

    const status = mapDiditStatus(payload.status);
    const decision = payload.decision
      ? parseWebhookDecision(payload.status, payload.decision)
      : null;
    await this.applyDecision(verification.id, verification.userId, status, decision);
    return { received: true, matched: true };
  }

  /**
   * Called by kyc.controller.ts's POST /kyc/self/submit once a trainer has
   * completed document + selfie capture in the DLKYC app. Runs
   * SelfHostedKycService.evaluate() then feeds its DiditDecision-shaped
   * result through the exact same applyDecision path Didit's webhook uses,
   * so User.kycStatus/kycVerifiedAt updates identically regardless of
   * provider.
   */
  async submitSelfHostedVerification(verificationId: string, userId: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });
    if (!verification || verification.userId !== userId || verification.provider !== 'self') {
      throw new NotFoundException('Verification not found');
    }
    const decision = await this.selfHosted.evaluate(verificationId, userId);
    const status = mapSelfHostedStatus(decision.status);
    await this.applyDecision(verification.id, userId, status, decision);
    return this.getMyStatus(userId);
  }

  /** Fallback poll used only by the admin "Refresh from Didit" action -- see didit.service.ts's getDecision doc comment. */
  async refreshFromProvider(id: string) {
    const verification = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.provider !== 'didit') {
      throw new BadRequestException(
        'This verification was not created via Didit and has no remote decision to refresh.',
      );
    }
    const decision = await this.didit.getDecision(verification.providerSessionId);
    const status = mapDiditStatus(decision.status);
    await this.applyDecision(verification.id, verification.userId, status, decision);
    return this.prisma.kycVerification.findUniqueOrThrow({ where: { id } });
  }

  private async applyDecision(
    verificationId: string,
    userId: string,
    status: KycStatus,
    decision: DiditDecision | null,
  ) {
    const idVerification = decision?.idVerifications[0];
    const resolvedAt = new Date();
    const verificationData = {
      status,
      documentType: idVerification?.documentType ?? undefined,
      documentNumberMasked: idVerification?.documentNumber
        ? maskDocumentNumber(idVerification.documentNumber)
        : undefined,
      faceMatchScore: decision?.faceMatchScore ?? undefined,
      livenessScore: decision?.livenessScore ?? undefined,
      declineReason: decision?.declineReason ?? undefined,
      decisionEncryptedJson: decision
        ? (encryptKycField(JSON.stringify(decision.raw)) as unknown as Prisma.InputJsonValue)
        : undefined,
      webhookReceivedAt: resolvedAt,
    };
    const identityFingerprint =
      status === KycStatus.APPROVED && idVerification?.documentNumber
        ? fingerprintKycDocument(idVerification.documentNumber)
        : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.kycVerification.update({
          where: { id: verificationId },
          data: verificationData,
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            kycStatus: status,
            kycVerifiedAt: status === KycStatus.APPROVED ? resolvedAt : undefined,
            ...(identityFingerprint ? { diditIdentityFingerprint: identityFingerprint } : {}),
          },
        });
      });
    } catch (err) {
      const duplicateIdentity =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('diditIdentityFingerprint');
      if (!duplicateIdentity) throw err;

      // Do not reveal the account that already owns the identity. The raw
      // DIDIT decision remains encrypted for an authorised audit.
      await this.prisma.$transaction(async (tx) => {
        await tx.kycVerification.update({
          where: { id: verificationId },
          data: {
            ...verificationData,
            status: KycStatus.DECLINED,
            declineReason: 'This identity is already associated with another account.',
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { kycStatus: KycStatus.DECLINED, kycVerifiedAt: null },
        });
      });
      this.logger.warn(`DIDIT identity duplicate blocked for user=${userId}`);
    }
  }

  async adminList(filters: {
    status?: KycStatus;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const search = filters.search?.trim();
    const where: Prisma.KycVerificationWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { email: { contains: search, mode: 'insensitive' as const } },
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
                { phoneNumber: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.kycVerification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
          },
        },
      }),
      this.prisma.kycVerification.count({ where }),
    ]);
    return {
      items: items.map(toPublicVerification),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    };
  }

  async adminGet(id: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
        },
      },
    });
    if (!verification) throw new NotFoundException('Verification not found');
    return toPublicVerification(verification);
  }

  /**
   * Decrypts and returns the raw decision payload -- the one place
   * decisionEncryptedJson is ever read back, gated to admins only
   * (RolesGuard on the controller route) and logged on every access, since
   * this is the only surface that can expose a trainer's raw document
   * number/name/DOB or self-hosted-kyc.service.ts's LLM-assisted OCR read.
   * For a self-hosted verification, `raw.botFindings` is the reviewer-
   * facing signal this exists for; for Didit, `raw` is its full decision
   * object as already stored today.
   */
  async adminGetDecision(id: string, adminId: string) {
    const verification = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!verification) throw new NotFoundException('Verification not found');
    if (!verification.decisionEncryptedJson) {
      return { raw: null };
    }
    this.logger.log(`Admin ${adminId} viewed decrypted decision for KycVerification ${id}`);
    const encrypted = verification.decisionEncryptedJson as unknown as {
      encryptedValue: string;
      iv: string;
      authTag: string;
    };
    const raw = JSON.parse(decryptKycField(encrypted));
    return { raw };
  }

  /** Lists captured evidence for a self-hosted verification (id/kind/capturedAt only -- never the bucket/key, since those are only ever resolved server-side by adminGetEvidenceRow for the redacted-copy endpoint). Didit verifications have no KycCaptureEvidence rows -- evidence lives on Didit's side. */
  async adminListEvidence(verificationId: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });
    if (!verification) throw new NotFoundException('Verification not found');
    const evidence = await this.prisma.kycCaptureEvidence.findMany({
      where: { kycVerificationId: verificationId },
      orderBy: { capturedAt: 'asc' },
      select: { id: true, kind: true, capturedAt: true },
    });
    return evidence;
  }

  /** Resolves one evidence row's bucket/key, scoped to the given verification so an evidence id from one trainer's verification can't be used to fetch another's. Used only by the redacted-copy endpoint -- raw bucket/key never leave this method. */
  async adminGetEvidenceRow(verificationId: string, evidenceId: string) {
    const evidence = await this.prisma.kycCaptureEvidence.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence || evidence.kycVerificationId !== verificationId) {
      throw new NotFoundException('Evidence not found');
    }
    return evidence;
  }
}

function mapDiditStatus(status: string | undefined): KycStatus {
  if (!status) return KycStatus.IN_PROGRESS;
  return DIDIT_STATUS_MAP[status] ?? KycStatus.IN_PROGRESS;
}

/** self-hosted-kyc.service.ts's toDiditDecision emits the same "Approved"/"In Review"/"Declined" vocabulary Didit uses, so this reuses DIDIT_STATUS_MAP rather than a second lookup table. */
function mapSelfHostedStatus(status: string | undefined): KycStatus {
  return mapDiditStatus(status);
}

/** Parses the inline `decision` object a status.updated webhook carries -- same shape as DiditService.getDecision's fallback-poll response, so both paths converge on one DiditDecision shape before reaching applyDecision. */
function parseWebhookDecision(
  status: string | undefined,
  decision: Record<string, unknown>,
): DiditDecision {
  const idVerifications = toArray(decision.id_verifications).map((item) => ({
    documentType: strOrNull(item.document_type),
    documentNumber: strOrNull(item.document_number),
    firstName: strOrNull(item.first_name),
    lastName: strOrNull(item.last_name),
    dateOfBirth: strOrNull(item.date_of_birth),
    status: strOrNull(item.status),
  }));
  const faceMatch = toArray(decision.face_matches)[0];
  const liveness = toArray(decision.liveness_checks)[0];
  return {
    status: status ?? 'In Progress',
    idVerifications,
    faceMatchScore: numOrNull(faceMatch?.score),
    faceMatchStatus: strOrNull(faceMatch?.status),
    livenessScore: numOrNull(liveness?.score),
    livenessStatus: strOrNull(liveness?.status),
    declineReason: strOrNull(decision.decline_reason),
    raw: decision,
  };
}

function toArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toPublicVerification(
  verification: Prisma.KycVerificationGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          email: true;
          firstName: true;
          lastName: true;
          phoneNumber: true;
        };
      };
    };
  }>,
) {
  // Never includes decisionEncryptedJson -- ordinary reads never touch the decrypt path.
  return {
    id: verification.id,
    userId: verification.userId,
    user: verification.user,
    provider: verification.provider,
    status: verification.status,
    documentType: verification.documentType,
    documentNumberMasked: verification.documentNumberMasked,
    faceMatchScore: verification.faceMatchScore?.toString() ?? null,
    livenessScore: verification.livenessScore?.toString() ?? null,
    declineReason: verification.declineReason,
    webhookReceivedAt: verification.webhookReceivedAt,
    createdAt: verification.createdAt,
    updatedAt: verification.updatedAt,
  };
}
