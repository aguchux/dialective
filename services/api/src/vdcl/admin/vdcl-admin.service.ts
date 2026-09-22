import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OtpPurpose, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { resolveOtpDestination } from '../../otp/otp.util';
import { adminActionContextHash } from '../../wallet/otp-context.util';
import { CoverageNotifierService } from '../rights/coverage-notifier.service';
import { VdclDocumentsService } from '../documents/vdcl-documents.service';

/**
 * Admin lifecycle control over VDCL agreements.
 *
 * Phase 0 shipped the rights check with no way to create or change an
 * agreement, which meant nothing could be exercised end to end: enforcement
 * could only ever deny, and the withdrawal notification had no caller. This
 * is the minimum writer that closes that gap -- activate, suspend,
 * reinstate, withdraw -- so an admin can drive an agreement through its
 * states and watch enforcement respond.
 *
 * It is deliberately NOT the contributor-facing maker (Phase 3), which is
 * where a contributor drafts, reviews and signs. This is the Dialect
 * Library side of the same document: countersignature is what actually
 * grants rights, and it carries an OTP step-up for the same reason every
 * other consequential admin action in this codebase does.
 */
@Injectable()
export class VdclAdminService {
  private readonly logger = new Logger(VdclAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageNotifier: CoverageNotifierService,
    private readonly documents: VdclDocumentsService,
    private readonly otp: OtpService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async listAgreements(params: { status?: VdclVersionStatus; take?: number }) {
    const take = Math.min(params.take ?? 50, 200);
    return this.prisma.vdclAgreement.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        activeVersion: {
          select: {
            id: true,
            version: true,
            status: true,
            signedAt: true,
            countersignedAt: true,
            manifestHash: true,
            _count: { select: { grants: true } },
          },
        },
        _count: { select: { versions: true } },
      },
      ...(params.status
        ? { where: { versions: { some: { status: params.status } } } }
        : {}),
    });
  }

  async getAgreement(agreementId: string) {
    const agreement = await this.prisma.vdclAgreement.findUnique({
      where: { id: agreementId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: {
            grants: { select: { purpose: true, wordingVersion: true, grantedAt: true } },
            manifest: {
              select: {
                manifestKey: true,
                recordingCount: true,
                totalDurationMs: true,
                transcriptCount: true,
                compiledAt: true,
              },
            },
            signatureEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        },
        // Contributor identity IS visible here -- this is the admin surface,
        // and Dialect Library is the party that sees both halves. It must
        // never be reused for a subscriber- or contributor-facing route.
        contributor: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!agreement) {
      throw new NotFoundException('VDCL agreement not found');
    }
    return agreement;
  }

  /**
   * Every condition a version must meet to be countersigned.
   *
   * Shared by the OTP-request and activate paths so the two can never
   * disagree -- an admin must never be handed a code for an action that
   * will then refuse.
   */
  private async assertActivatable(versionId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: { agreement: true, manifest: { select: { id: true } } },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (version.status !== VdclVersionStatus.PENDING_COUNTERSIGNATURE) {
      throw new BadRequestException(
        `Only a version awaiting countersignature can be activated (this one is ${version.status})`,
      );
    }
    if (version.agreement.withdrawnAt) {
      throw new BadRequestException(
        'This agreement has been withdrawn by the contributor and cannot be activated',
      );
    }
    if (!version.manifest) {
      throw new BadRequestException(
        'This version has no compiled manifest, so it would grant rights over nothing',
      );
    }
    if (!version.manifestHash) {
      // The step-up binds the manifest hash, so a version without one could
      // not be bound to anything.
      throw new BadRequestException('This version has no manifest hash and cannot be signed');
    }
    return version;
  }

  /**
   * Issue the step-up code for a countersignature.
   *
   * Sent to the admin's own verified destination, and bound to this exact
   * version AND its manifest hash -- so a code issued while reviewing a
   * licence over one dataset cannot complete a countersignature over a
   * different one if the manifest changed in between.
   */
  async requestCountersignOtp(versionId: string, adminUserId: string) {
    const version = await this.assertActivatable(versionId);
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const { destination, channel } = await resolveOtpDestination(admin, this.settings);

    return this.otp.issueForUser(
      adminUserId,
      OtpPurpose.ADMIN_PAYOUT,
      destination,
      adminActionContextHash({
        action: 'vdcl-countersign',
        versionId,
        manifestHash: version.manifestHash!,
      }),
      channel,
    );
  }

  /**
   * Countersign a version and make it the agreement's active one.
   *
   * This is the moment a licence starts granting rights, so it is the most
   * consequential write in the module -- and the reason it carries a
   * step-up, the same as every other consequential admin action in this
   * codebase. A version may only be activated from
   * PENDING_COUNTERSIGNATURE -- activating a draft would mean granting
   * rights over a dataset the contributor never signed for.
   */
  async activateVersion(
    versionId: string,
    adminUserId: string,
    step?: { otpRequestId?: string; code?: string },
  ) {
    const version = await this.assertActivatable(versionId);

    // Gated on the same setting as every other admin step-up, so an admin
    // turning admin OTP off does not leave this one route demanding a code
    // they can no longer receive.
    if (await this.settings.isAdminPayoutOtpEnabled()) {
      if (!step?.otpRequestId || !step.code) {
        throw new UnprocessableEntityException(
          'OTP verification is required to countersign a VDCL',
        );
      }
      await this.otp.verify({
        otpRequestId: step.otpRequestId,
        userId: adminUserId,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code: step.code,
        // Re-derived from the row as it stands NOW. If the manifest changed
        // since the code was issued, this differs and verification fails
        // closed rather than countersigning a dataset nobody reviewed.
        contextHash: adminActionContextHash({
          action: 'vdcl-countersign',
          versionId,
          manifestHash: version.manifestHash!,
        }),
      });
    }

    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.vdclVersion.update({
        where: { id: versionId },
        data: {
          status: VdclVersionStatus.ACTIVE,
          countersignedAt: now,
          countersignedById: adminUserId,
          effectiveFrom: now,
        },
      }),
      // Supersede whatever was active before -- an agreement has exactly one
      // active version, and the rights check cross-checks this pointer
      // against the version's own status.
      ...(version.agreement.activeVersionId &&
      version.agreement.activeVersionId !== versionId
        ? [
            this.prisma.vdclVersion.update({
              where: { id: version.agreement.activeVersionId },
              data: { status: VdclVersionStatus.SUPERSEDED },
            }),
          ]
        : []),
      this.prisma.vdclAgreement.update({
        where: { id: version.agreementId },
        data: { activeVersionId: versionId },
      }),
      this.prisma.vdclSignatureEvent.create({
        data: {
          versionId,
          actorId: adminUserId,
          eventType: 'dl_countersign',
          signatureKind: 'digital',
        },
      }),
      this.prisma.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId,
          actorId: adminUserId,
          eventType: 'status_change',
          detail: `activated (was ${version.status})`,
        },
      }),
    ]);

    // Newly-covered recordings mean decks may have GAINED coverage.
    await this.coverageNotifier.notifyForAgreement(version.agreementId, 'reinstated');

    // Countersignature is the moment the licence starts granting rights, so
    // it is also when its documents become true. Issuing them here rather
    // than leaving it to a separate admin step means a countersigned
    // licence always HAS a certificate -- a contributor should never be
    // told their licence is active and then find nothing to download.
    //
    // Deliberately not inside the transaction above: rendering and uploading
    // are slow and can fail on a network blip, and a failed render must not
    // roll back an activation that has already been decided. A failure here
    // leaves pdfKey null, which the download route reports honestly and
    // re-issuing fixes.
    try {
      await this.documents.issueDocuments(versionId);
    } catch (err) {
      this.logger.error(
        `Activated version ${versionId} but failed to issue its documents: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return updated;
  }

  /**
   * Suspend an active licence (dispute, compliance review).
   *
   * Takes effect immediately for new streams -- the rights check reads
   * status live, including on pinned manifest versions.
   */
  async suspendVersion(versionId: string, adminUserId: string, reason: string) {
    const version = await this.prisma.vdclVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (version.status !== VdclVersionStatus.ACTIVE) {
      throw new BadRequestException(
        `Only an active version can be suspended (this one is ${version.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vdclVersion.update({
        where: { id: versionId },
        data: { status: VdclVersionStatus.SUSPENDED },
      });
      await tx.vdclSignatureEvent.create({
        data: { versionId, actorId: adminUserId, eventType: 'suspend', metadata: { reason } },
      });
      await tx.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId,
          actorId: adminUserId,
          eventType: 'status_change',
          detail: `suspended: ${reason}`,
        },
      });
      return row;
    });

    await this.coverageNotifier.notifyForAgreement(version.agreementId, 'suspended');
    return updated;
  }

  /** Lift a suspension. The version returns to ACTIVE and starts granting again. */
  async reinstateVersion(versionId: string, adminUserId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: { agreement: { select: { withdrawnAt: true } } },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (version.status !== VdclVersionStatus.SUSPENDED) {
      throw new BadRequestException(
        `Only a suspended version can be reinstated (this one is ${version.status})`,
      );
    }
    if (version.agreement.withdrawnAt) {
      throw new BadRequestException(
        'This agreement has been withdrawn by the contributor and cannot be reinstated',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vdclVersion.update({
        where: { id: versionId },
        data: { status: VdclVersionStatus.ACTIVE },
      });
      await tx.vdclSignatureEvent.create({
        data: { versionId, actorId: adminUserId, eventType: 'reinstate' },
      });
      await tx.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId,
          actorId: adminUserId,
          eventType: 'status_change',
          detail: 'reinstated',
        },
      });
      return row;
    });

    await this.coverageNotifier.notifyForAgreement(version.agreementId, 'reinstated');
    return updated;
  }

  /**
   * Record a contributor's withdrawal.
   *
   * Withdrawal is the CONTRIBUTOR's decision. This admin route exists to
   * action a withdrawal requested off-platform (support ticket, email)
   * until the contributor-facing control ships in Phase 3 -- it is not an
   * admin power to revoke a licence, which is what suspension is for.
   *
   * It is prospective: it stops new access immediately but cannot retract a
   * model already trained or a dataset already delivered.
   */
  async withdrawAgreement(agreementId: string, adminUserId: string, reason: string) {
    const agreement = await this.prisma.vdclAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new NotFoundException('VDCL agreement not found');
    }
    if (agreement.withdrawnAt) {
      return agreement; // idempotent -- already withdrawn
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vdclAgreement.update({
        where: { id: agreementId },
        data: { withdrawnAt: new Date() },
      });
      if (agreement.activeVersionId) {
        await tx.vdclVersion.update({
          where: { id: agreement.activeVersionId },
          data: { status: VdclVersionStatus.WITHDRAWN },
        });
        await tx.vdclSignatureEvent.create({
          data: {
            versionId: agreement.activeVersionId,
            actorId: adminUserId,
            eventType: 'withdraw',
            metadata: { reason, actionedByAdmin: true },
          },
        });
      }
      await tx.vdclAuditEvent.create({
        data: {
          agreementId,
          versionId: agreement.activeVersionId,
          actorId: adminUserId,
          eventType: 'withdrawal',
          detail: reason,
        },
      });
      return row;
    });

    // Every deck holding this contributor's recordings just lost coverage.
    await this.coverageNotifier.notifyForAgreement(agreementId, 'withdrawn');
    return updated;
  }
}
