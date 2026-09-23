import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { vdclSigningContextHash } from './vdcl-signing-context.util';

export type SignatureKind = 'drawn' | 'typed' | 'digital';

/**
 * Contributor signing.
 *
 * The step a contributor takes that turns a compiled manifest into a
 * document they are bound by. Three properties hold it together:
 *
 * 1. **The signature is bound to what was reviewed.** The step-up code is
 *    issued against a manifest hash and consumed against the hash re-read
 *    at signing time. A dataset that changed in between fails the check
 *    rather than landing a signature on a document nobody saw. That is
 *    Phase 3's acceptance criterion, enforced rather than documented.
 *
 * 2. **It is the contributor's own act.** Every route derives the actor
 *    from the JWT and refuses a version belonging to anyone else. An admin
 *    cannot sign on a contributor's behalf -- countersignature is Dialect
 *    Library's separate, later act.
 *
 * 3. **The evidence is kept, the secret is not.** VdclSignatureEvent records
 *    the method, kind, IP and user agent. It never stores the OTP code or
 *    the drawn signature image as a credential.
 */
@Injectable()
export class VdclSigningService {
  private readonly logger = new Logger(VdclSigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Load a version the contributor owns, or refuse.
   *
   * Ownership is checked on EVERY signing route rather than once at the
   * start of a flow, because each is independently reachable and a licence
   * signed by the wrong person is not recoverable by fixing it afterwards.
   */
  private async loadOwnedVersion(versionId: string, contributorId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: {
          select: {
            id: true,
            contributorId: true,
            licenceKey: true,
            withdrawnAt: true,
          },
        },
        manifest: { select: { id: true, manifestKey: true, recordingCount: true, dialectTags: true } },
        grants: { select: { purpose: true, wordingVersion: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (version.agreement.contributorId !== contributorId) {
      // Deliberately NotFound, not Forbidden: a contributor probing ids
      // should not learn that a version exists under someone else's name.
      throw new NotFoundException('VDCL version not found');
    }
    return version;
  }

  /** What the contributor is about to sign, for the review screen. */
  async getForReview(versionId: string, contributorId: string) {
    const version = await this.loadOwnedVersion(versionId, contributorId);
    const manifest = version.manifest
      ? await this.prisma.vdclManifest.findUnique({
          where: { id: version.manifest.id },
          select: {
            manifestKey: true,
            recordingCount: true,
            totalDurationMs: true,
            transcriptCount: true,
            excludedCount: true,
            meanCompositeScore: true,
            asrPipelineVersion: true,
            scoreDefinitions: true,
            compiledAt: true,
          },
        })
      : null;

    return {
      versionId: version.id,
      version: version.version,
      status: version.status,
      licenceKey: version.agreement.licenceKey,
      dialectTags: version.manifest?.dialectTags ?? [],
      termsVersion: version.termsVersion,
      manifestHash: version.manifestHash,
      signedAt: version.signedAt,
      countersignedAt: version.countersignedAt,
      purposes: version.grants.map((g) => ({
        purpose: g.purpose,
        wordingVersion: g.wordingVersion,
      })),
      manifest: manifest
        ? { ...manifest, totalDurationMs: manifest.totalDurationMs.toString() }
        : null,
    };
  }

  /**
   * Issue the step-up code for a signature.
   *
   * Refuses before sending anything if the version is not signable, so a
   * contributor is never handed a code for an action that will fail.
   */
  async requestSigningOtp(versionId: string, contributorId: string) {
    const version = await this.assertSignable(versionId, contributorId);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: contributorId },
      select: { email: true },
    });

    const contextHash = vdclSigningContextHash({
      versionId: version.id,
      manifestHash: version.manifestHash!,
      purposes: version.grants.map((g) => g.purpose),
    });

    const issued = await this.otp.issueForUser(
      contributorId,
      'VDCL_SIGN',
      user.email,
      contextHash,
    );

    return {
      otpRequestId: issued.otpRequestId,
      expiresInSeconds: issued.expiresInSeconds,
      manifestHash: version.manifestHash,
    };
  }

  /**
   * Every condition a version must meet to be signed.
   *
   * Shared by the OTP-request and sign paths so the two can never disagree
   * -- an issued code must always correspond to an action that can complete.
   */
  private async assertSignable(versionId: string, contributorId: string) {
    const version = await this.loadOwnedVersion(versionId, contributorId);

    if (version.agreement.withdrawnAt) {
      throw new BadRequestException(
        'You withdrew your licence for this dialect. Contact support to license your recordings again.',
      );
    }
    if (version.signedAt) {
      throw new BadRequestException('You have already signed this version.');
    }
    if (version.status !== VdclVersionStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        version.status === VdclVersionStatus.DRAFT ||
        version.status === VdclVersionStatus.PENDING_COMPILATION
          ? 'This licence is still being compiled. You will be able to sign once it is ready.'
          : `This version cannot be signed (it is ${version.status}).`,
      );
    }
    if (!version.manifest || !version.manifestHash) {
      // Signing a version with no manifest would bind the contributor to a
      // document with no contents -- a licence over nothing, which reads as
      // a valid grant.
      throw new BadRequestException(
        'This version has no compiled manifest, so there is nothing to sign.',
      );
    }
    if (version.grants.length === 0) {
      throw new BadRequestException(
        'This version grants no purposes, so signing it would permit nothing.',
      );
    }

    // Identity is re-checked at signing time, not trusted from when the
    // draft was created. KYC can lapse between compilation and signature,
    // and a licence signed on stale evidence is the exact failure the DLKYC
    // reference exists to prevent.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: contributorId },
      select: { kycStatus: true, status: true },
    });
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('This account cannot sign a licence at the moment.');
    }
    if (user.kycStatus !== KycStatus.APPROVED) {
      throw new ForbiddenException(
        'Your identity verification must be approved before you can sign a licence.',
      );
    }

    return version;
  }

  /**
   * Record the contributor's signature.
   *
   * Moves the version to PENDING_COUNTERSIGNATURE. It does NOT activate:
   * Dialect Library countersigns separately after compliance review, and
   * only that step grants rights.
   */
  async sign(params: {
    versionId: string;
    contributorId: string;
    otpRequestId: string;
    code: string;
    signatureKind: SignatureKind;
    /** Typed name or a reference to a drawn signature -- evidence, not a secret. */
    signatureLabel?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const version = await this.assertSignable(params.versionId, params.contributorId);

    // Re-derive the binding from the row as it stands NOW. If the manifest
    // or the granted purposes changed since the code was issued, this hash
    // differs from the one the code carries and verification fails closed.
    const contextHash = vdclSigningContextHash({
      versionId: version.id,
      manifestHash: version.manifestHash!,
      purposes: version.grants.map((g) => g.purpose),
    });

    const otpRow = await this.otp.verifyWithoutConsuming({
      otpRequestId: params.otpRequestId,
      userId: params.contributorId,
      purpose: 'VDCL_SIGN',
      code: params.code,
      contextHash,
    });

    const now = new Date();
    const signed = await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.update({ where: { id: otpRow.id }, data: { consumedAt: now } });

      // Guarded on the status the check above read, so two concurrent
      // submissions cannot both land a signature.
      const claimed = await tx.vdclVersion.updateMany({
        where: {
          id: version.id,
          status: VdclVersionStatus.PENDING_REVIEW,
          signedAt: null,
        },
        data: {
          status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
          signedAt: now,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('This version was already signed.');
      }

      await tx.vdclSignatureEvent.create({
        data: {
          versionId: version.id,
          actorId: params.contributorId,
          eventType: 'contributor_sign',
          stepUpMethod: 'otp_email',
          signatureKind: params.signatureKind,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          metadata: {
            manifestHash: version.manifestHash,
            manifestKey: version.manifest!.manifestKey,
            recordingCount: version.manifest!.recordingCount,
            purposes: version.grants.map((g) => g.purpose),
            wordingVersions: version.grants.map((g) => g.wordingVersion),
            termsVersion: version.termsVersion,
            ...(params.signatureLabel ? { signatureLabel: params.signatureLabel } : {}),
          },
        },
      });

      await tx.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId: version.id,
          actorId: params.contributorId,
          eventType: 'status_change',
          detail: `contributor signed version ${version.version}`,
          metadata: { manifestHash: version.manifestHash },
        },
      });

      return tx.vdclVersion.findUniqueOrThrow({ where: { id: version.id } });
    });

    return {
      versionId: signed.id,
      status: signed.status,
      signedAt: signed.signedAt,
      manifestHash: signed.manifestHash,
    };
  }

  /**
   * The signing receipt -- what the contributor gets back as proof.
   *
   * Reads from the recorded signature event rather than re-deriving
   * anything, so it says what actually happened, not what should have.
   */
  async getReceipt(versionId: string, contributorId: string) {
    const version = await this.loadOwnedVersion(versionId, contributorId);
    const event = await this.prisma.vdclSignatureEvent.findFirst({
      where: { versionId, eventType: 'contributor_sign' },
      orderBy: { createdAt: 'desc' },
    });
    if (!event) {
      throw new NotFoundException('This version has not been signed yet.');
    }
    return {
      versionId,
      licenceKey: version.agreement.licenceKey,
      signedAt: event.createdAt,
      signatureKind: event.signatureKind,
      stepUpMethod: event.stepUpMethod,
      manifestHash: version.manifestHash,
      purposes: version.grants.map((g) => g.purpose),
      status: version.status,
    };
  }
}
