import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KycStatus, Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { DiditDecision, DiditService } from './didit.service';
import {
  encryptKycField,
  fingerprintKycDocument,
  maskDocumentNumber,
} from '../common/kyc-crypto.util';

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
  ) {}

  async createVerificationSession(userId: string, callbackUrl: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { kycStatus: true },
    });
    if (user.kycStatus === KycStatus.APPROVED) {
      throw new BadRequestException('You are already verified');
    }
    const session = await this.didit.createSession(userId, callbackUrl);
    // Didit can hand back an already-known session_id for the same
    // vendor_data (e.g. the user re-opens the verification dialog while
    // their prior session is still active) -- upsert instead of create so
    // that replay doesn't 500 on the providerSessionId unique constraint.
    await this.prisma.kycVerification.upsert({
      where: { providerSessionId: session.sessionId },
      create: {
        userId,
        providerSessionId: session.sessionId,
        status: KycStatus.IN_PROGRESS,
      },
      update: {},
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: KycStatus.IN_PROGRESS },
    });
    return session;
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

  /** Fallback poll used only by the admin "Refresh from Didit" action -- see didit.service.ts's getDecision doc comment. */
  async refreshFromProvider(id: string) {
    const verification = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!verification) throw new NotFoundException('Verification not found');
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

  async adminList(filters: { status?: KycStatus; page: number; pageSize: number }) {
    const where: Prisma.KycVerificationWhereInput = filters.status
      ? { status: filters.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.kycVerification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
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
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!verification) throw new NotFoundException('Verification not found');
    return toPublicVerification(verification);
  }
}

function mapDiditStatus(status: string | undefined): KycStatus {
  if (!status) return KycStatus.IN_PROGRESS;
  return DIDIT_STATUS_MAP[status] ?? KycStatus.IN_PROGRESS;
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
    include: { user: { select: { id: true; email: true; firstName: true; lastName: true } } };
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
