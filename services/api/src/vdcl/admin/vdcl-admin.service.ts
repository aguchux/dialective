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
 * Every licence action that carries a step-up, besides countersignature.
 *
 * All of them are consequential and irreversible-ish: they stop a
 * contributor's work reaching subscribers, send their licence back, or end
 * it. Each was previously a single unconfirmed click.
 */
export type VdclAdminAction =
  | 'vdcl-suspend'
  | 'vdcl-reinstate'
  | 'vdcl-revoke'
  | 'vdcl-withdraw'
  | 'vdcl-reissue';

/** What the refusal message says the code is for. */
const VDCL_ACTION_LABELS: Record<VdclAdminAction, string> = {
  'vdcl-suspend': 'suspend this licence',
  'vdcl-reinstate': 'reinstate this licence',
  'vdcl-revoke': 'revoke this countersignature',
  'vdcl-withdraw': 'record this withdrawal',
  'vdcl-reissue': 're-issue these documents',
};

/** The optional step-up every guarded action accepts. */
export interface VdclStepUp {
  otpRequestId?: string;
  code?: string;
}

/**
 * The version fields the agreements list needs, shared so the active
 * version and the latest version cannot describe themselves differently.
 */
const VERSION_SUMMARY_SELECT = {
  id: true,
  version: true,
  status: true,
  signedAt: true,
  countersignedAt: true,
  manifestHash: true,
  rejectionReason: true,
  rejectedAt: true,
  pdfKey: true,
  pngKey: true,
  _count: { select: { grants: true } },
} as const;

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
    const agreements = await this.prisma.vdclAgreement.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        activeVersion: {
          select: VERSION_SUMMARY_SELECT,
        },
        // The LATEST version, whatever its status. activeVersion alone was
        // not enough: activeVersionId is only set AT countersignature, so a
        // version sitting in PENDING_COUNTERSIGNATURE -- the one state that
        // actually needs an admin -- was invisible here. The panel showed
        // "no active version" and offered only a withdrawal form for the
        // very licence it was meant to be countersigning.
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: VERSION_SUMMARY_SELECT,
        },
        _count: { select: { versions: true } },
      },
      ...(params.status
        ? { where: { versions: { some: { status: params.status } } } }
        : {}),
    });

    return agreements.map(({ versions, ...agreement }) => ({
      ...agreement,
      // What the admin should be looking at: the active version when there
      // is one, otherwise whatever is most recent and may need action.
      latestVersion: versions[0] ?? null,
    }));
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
      // Its own purpose, not ADMIN_PAYOUT. The borrowed one sent an email
      // about a payout, telling an admin nothing about the fact they were
      // about to bind the company to a licence over someone's voice.
      OtpPurpose.VDCL_COUNTERSIGN,
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
   * Re-render a version's documents, behind the same step-up as everything
   * else on this screen. Re-issuing rewrites the stored hashes, so an
   * accidental click changes what a contributor's certificate verifies
   * against.
   */
  async reissueDocuments(versionId: string, adminUserId: string, step?: VdclStepUp) {
    await this.verifyActionOtp({
      action: 'vdcl-reissue',
      targetId: versionId,
      adminUserId,
      step,
    });
    return this.documents.issueDocuments(versionId);
  }

  /**
   * Issue a step-up code for any other licence action.
   *
   * Every action on this screen either grants commercial rights over
   * someone's voice, stops their work reaching subscribers, or sends their
   * licence back -- and all of them were a single click. A misplaced click
   * on `Suspend` cut a contributor off with no confirmation at all.
   *
   * The code is bound to the action AND its target, so a code issued to
   * suspend one licence cannot withdraw another, and a code issued to
   * suspend cannot be replayed to revoke.
   */
  async requestActionOtp(
    params: { action: VdclAdminAction; targetId: string },
    adminUserId: string,
  ) {
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const { destination, channel } = await resolveOtpDestination(admin, this.settings);

    return this.otp.issueForUser(
      adminUserId,
      OtpPurpose.VDCL_COUNTERSIGN,
      destination,
      adminActionContextHash({ action: params.action, targetId: params.targetId }),
      channel,
    );
  }

  /**
   * Verify a step-up for a licence action, when step-ups are switched on.
   *
   * Gated on the same platform setting as every other admin step-up, so an
   * admin who turns admin OTP off is not locked out of their own licence
   * screen by a code they can no longer receive.
   */
  private async verifyActionOtp(
    params: {
      action: VdclAdminAction;
      targetId: string;
      adminUserId: string;
      step?: VdclStepUp;
    },
  ) {
    if (!(await this.settings.isAdminPayoutOtpEnabled())) {
      return;
    }
    if (!params.step?.otpRequestId || !params.step.code) {
      throw new UnprocessableEntityException(
        `OTP verification is required to ${VDCL_ACTION_LABELS[params.action]}`,
      );
    }
    await this.otp.verify({
      otpRequestId: params.step.otpRequestId,
      userId: params.adminUserId,
      purpose: OtpPurpose.VDCL_COUNTERSIGN,
      code: params.step.code,
      // Bound to the action and its target, so a code cannot be moved
      // between actions or between licences.
      contextHash: adminActionContextHash({
        action: params.action,
        targetId: params.targetId,
      }),
    });
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
        // Must match what requestCountersignOtp issued, or every
        // countersignature fails verification.
        purpose: OtpPurpose.VDCL_COUNTERSIGN,
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
  async suspendVersion(
    versionId: string,
    adminUserId: string,
    reason: string,
    step?: VdclStepUp,
  ) {
    const version = await this.prisma.vdclVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (version.status !== VdclVersionStatus.ACTIVE) {
      throw new BadRequestException(
        `Only an active version can be suspended (this one is ${version.status})`,
      );
    }
    await this.verifyActionOtp({
      action: 'vdcl-suspend',
      targetId: versionId,
      adminUserId,
      step,
    });

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
  async reinstateVersion(versionId: string, adminUserId: string, step?: VdclStepUp) {
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
    await this.verifyActionOtp({
      action: 'vdcl-reinstate',
      targetId: versionId,
      adminUserId,
      step,
    });

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
   * Revoke Dialect Library's countersignature and send the version back.
   *
   * Distinct from both of its neighbours, and the distinction is the point:
   *
   * - SUSPEND is an internal compliance hold on a licence that is otherwise
   *   fine. It is reversible by reinstate and says nothing to the
   *   contributor.
   * - WITHDRAW is the CONTRIBUTOR's decision, and is theirs alone.
   * - REVOKE is Dialect Library saying "we are not countersigning this, and
   *   here is what to fix". It undoes only OUR signature. The contributor's
   *   signature and the manifest it was bound to stay on the record -- we do
   *   not get to erase the fact that they signed -- but the version no
   *   longer grants anything, and they can compile and sign a fresh one.
   *
   * The reason is mandatory and contributor-facing. A rejection someone
   * cannot act on is just a dead end, and the whole purpose of sending it
   * back rather than suspending it is to let them address it.
   */
  async revokeCountersignature(
    versionId: string,
    adminUserId: string,
    reason: string,
    step?: VdclStepUp,
  ) {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException('A reason is required so the contributor can address it');
    }

    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: { agreement: { select: { activeVersionId: true } } },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    // Revocable from any state where DL has committed, or is about to.
    // REJECTED is excluded so a second revoke cannot overwrite the first
    // reason the contributor is already working from.
    const revocable: VdclVersionStatus[] = [
      VdclVersionStatus.ACTIVE,
      VdclVersionStatus.SUSPENDED,
      VdclVersionStatus.PENDING_COUNTERSIGNATURE,
    ];
    if (!revocable.includes(version.status)) {
      throw new BadRequestException(
        `Only a countersigned or awaiting-countersignature version can be revoked (this one is ${version.status})`,
      );
    }
    await this.verifyActionOtp({
      action: 'vdcl-revoke',
      targetId: versionId,
      adminUserId,
      step,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vdclVersion.update({
        where: { id: versionId },
        data: {
          status: VdclVersionStatus.REJECTED,
          rejectionReason: trimmed,
          rejectedAt: new Date(),
          // Our signature is withdrawn; theirs is not touched.
          countersignedAt: null,
          countersignedById: null,
        },
      });
      // Clear the pointer if this WAS the active version, so the rights
      // check denies immediately rather than continuing to resolve a
      // version that no longer grants anything.
      if (version.agreement.activeVersionId === versionId) {
        await tx.vdclAgreement.update({
          where: { id: version.agreementId },
          data: { activeVersionId: null },
        });
      }
      await tx.vdclSignatureEvent.create({
        data: {
          versionId,
          actorId: adminUserId,
          eventType: 'countersign_revoked',
          metadata: { reason: trimmed },
        },
      });
      await tx.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId,
          actorId: adminUserId,
          eventType: 'status_change',
          detail: `countersignature revoked: ${trimmed}`,
        },
      });
      return row;
    });

    await this.coverageNotifier.notifyForAgreement(version.agreementId, 'suspended');
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
  async withdrawAgreement(
    agreementId: string,
    adminUserId: string,
    reason: string,
    step?: VdclStepUp,
  ) {
    const agreement = await this.prisma.vdclAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new NotFoundException('VDCL agreement not found');
    }
    if (agreement.withdrawnAt) {
      return agreement; // idempotent -- already withdrawn
    }
    // After the idempotency check, so re-confirming an already-withdrawn
    // agreement does not demand a code for a write that will not happen.
    await this.verifyActionOtp({
      action: 'vdcl-withdraw',
      targetId: agreementId,
      adminUserId,
      step,
    });

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
