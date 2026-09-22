import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CoverageNotifierService } from '../rights/coverage-notifier.service';

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
 * It is deliberately NOT the contributor-facing maker (Phase 3), and it
 * does not compile manifests (Phase 2). An agreement activated here covers
 * whatever its manifest already contains, which until Phase 2 means an
 * admin must seed one explicitly. That is the intended shape: this exists
 * for operating and testing the gate, not for issuing licences at scale.
 */
@Injectable()
export class VdclAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageNotifier: CoverageNotifierService,
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
   * Countersign a version and make it the agreement's active one.
   *
   * This is the moment a licence starts granting rights, so it is the most
   * consequential write in the module. A version may only be activated from
   * PENDING_COUNTERSIGNATURE -- activating a draft would mean granting
   * rights over a dataset the contributor never signed for.
   */
  async activateVersion(versionId: string, adminUserId: string) {
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
