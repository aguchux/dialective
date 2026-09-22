import { Injectable, Logger } from '@nestjs/common';
import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

/**
 * Why a recording may or may not be used. These strings are written verbatim
 * into StreamAccessLog.entitlementDecision (which already accepts
 * "allowed" | "denied:<reason>"), so enforcement becomes auditable through
 * the logging that already exists rather than needing its own pipeline.
 */
export type RightsDenialReason =
  | 'no_vdcl' // no agreement covers this recording at all
  | 'purpose_not_granted' // an agreement exists, but not for this use
  | 'licence_withdrawn' // contributor withdrew (prospective -- see VdclAgreement.withdrawnAt)
  | 'licence_suspended' // Dialect Library suspended it
  | 'licence_not_active' // draft/pending/superseded -- signed but not in force
  | 'recording_not_covered'; // agreement is active but this clip is outside its frozen manifest

export interface RightsDecision {
  allowed: boolean;
  reason?: RightsDenialReason;
  /** Set when a decision resolved to a specific licence, for audit. */
  agreementId?: string;
  versionId?: string;
  /** The string to write into StreamAccessLog.entitlementDecision. */
  entitlementDecision: string;
}

const ALLOWED: RightsDecision = { allowed: true, entitlementDecision: 'allowed' };

function deny(reason: RightsDenialReason, ids?: { agreementId?: string; versionId?: string }): RightsDecision {
  return { allowed: false, reason, entitlementDecision: `denied:${reason}`, ...ids };
}

/**
 * The VDCL rights check -- Phase 0's entire deliverable.
 *
 * One question: may recording X be used for purpose Y? Everything else in the
 * VDCL product (the maker, the documents, the QR verification) is presentation
 * on top of this answer.
 *
 * It FAILS CLOSED. No active VDCL covering the recording for the requested
 * purpose means deny. That is only safe to ship unconditionally because
 * production currently has 0 Stream Decks, so there is no subscriber traffic
 * to interrupt -- and it stops being safe the moment the first deck ships,
 * which is exactly why this lands first.
 *
 * The admin kill switch (PlatformSettings.vdclEnforcementEnabled, default
 * false) exists for the transition only. While it is off, this returns
 * allowed and records nothing, so the code can sit in production being
 * exercised before it starts refusing anything.
 */
@Injectable()
export class RightsService {
  private readonly logger = new Logger(RightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * May this recording be used for this purpose?
   *
   * Resolution is at the RECORDING level, never the deck level: a deck cannot
   * assume every recording inside it carries identical rights, since the
   * recordings come from different contributors who each granted different
   * things. Deck-level coverage is a computed roll-up of this, never an
   * assumption baked into the deck.
   */
  async mayUse(recordingId: string, purpose: VdclPurpose): Promise<RightsDecision> {
    if (!(await this.settings.isVdclEnforcementEnabled())) {
      return ALLOWED;
    }

    // The manifest is the authority on coverage, not the recording's own
    // dialectTag or owner: a contributor's licence covers exactly the clips
    // frozen into its manifest at signing time, and nothing else. A recording
    // made after signing is not retroactively covered.
    const items = await this.prisma.vdclManifestItem.findMany({
      where: { recordingId },
      select: {
        manifest: {
          select: {
            versionId: true,
            vdclVersion: {
              select: {
                id: true,
                status: true,
                agreementId: true,
                agreement: { select: { id: true, withdrawnAt: true, activeVersionId: true } },
                grants: { select: { purpose: true } },
              },
            },
          },
        },
      },
    });

    if (items.length === 0) {
      return deny('no_vdcl');
    }

    // A recording can appear in several manifests (successive versions of the
    // same agreement, or an amendment). Any one of them granting the purpose
    // is sufficient, so collect the best answer rather than judging the first.
    let bestDenial: RightsDecision = deny('no_vdcl');

    for (const item of items) {
      const version = item.manifest.vdclVersion;
      const ids = { agreementId: version.agreementId, versionId: version.id };

      // Withdrawal wins over everything, including an otherwise-ACTIVE
      // version, because withdrawal is the contributor's own decision and
      // must take effect immediately for new access.
      if (version.agreement.withdrawnAt) {
        bestDenial = deny('licence_withdrawn', ids);
        continue;
      }
      if (version.status === VdclVersionStatus.SUSPENDED) {
        bestDenial = deny('licence_suspended', ids);
        continue;
      }
      if (version.status !== VdclVersionStatus.ACTIVE) {
        bestDenial = deny('licence_not_active', ids);
        continue;
      }
      // Guards against a stale manifest pointing at a version the agreement
      // has since moved off. The agreement's own pointer is authoritative.
      if (version.agreement.activeVersionId !== version.id) {
        bestDenial = deny('licence_not_active', ids);
        continue;
      }
      if (!version.grants.some((g) => g.purpose === purpose)) {
        bestDenial = deny('purpose_not_granted', ids);
        continue;
      }

      return { ...ALLOWED, ...ids };
    }

    return bestDenial;
  }

  /**
   * Batch form, for manifest listings that would otherwise issue one query
   * per recording. Same semantics as mayUse, same fail-closed default: a
   * recordingId absent from the returned map is denied.
   */
  async mayUseMany(
    recordingIds: string[],
    purpose: VdclPurpose,
  ): Promise<Map<string, RightsDecision>> {
    const result = new Map<string, RightsDecision>();
    if (recordingIds.length === 0) return result;

    if (await this.settings.isVdclEnforcementEnabled().then((on) => !on)) {
      for (const id of recordingIds) result.set(id, ALLOWED);
      return result;
    }

    const items = await this.prisma.vdclManifestItem.findMany({
      where: { recordingId: { in: recordingIds } },
      select: {
        recordingId: true,
        manifest: {
          select: {
            vdclVersion: {
              select: {
                id: true,
                status: true,
                agreementId: true,
                agreement: { select: { withdrawnAt: true, activeVersionId: true } },
                grants: { select: { purpose: true } },
              },
            },
          },
        },
      },
    });

    for (const id of recordingIds) result.set(id, deny('no_vdcl'));

    for (const item of items) {
      const version = item.manifest.vdclVersion;
      const ids = { agreementId: version.agreementId, versionId: version.id };
      const current = result.get(item.recordingId);
      if (current?.allowed) continue;

      if (version.agreement.withdrawnAt) {
        result.set(item.recordingId, deny('licence_withdrawn', ids));
        continue;
      }
      if (version.status === VdclVersionStatus.SUSPENDED) {
        result.set(item.recordingId, deny('licence_suspended', ids));
        continue;
      }
      if (
        version.status !== VdclVersionStatus.ACTIVE ||
        version.agreement.activeVersionId !== version.id
      ) {
        result.set(item.recordingId, deny('licence_not_active', ids));
        continue;
      }
      if (!version.grants.some((g) => g.purpose === purpose)) {
        result.set(item.recordingId, deny('purpose_not_granted', ids));
        continue;
      }
      result.set(item.recordingId, { ...ALLOWED, ...ids });
    }

    return result;
  }

  /**
   * Records a rights decision to the VDCL audit trail.
   *
   * This exists because the 7 stream guards reject before the audio handler's
   * finally block runs, so a guard denial never reaches StreamAccessLog at
   * all. A licence denial is exactly the kind of event that must not be
   * invisible, so it gets its own append-only record. Never throws -- an
   * audit write failing must not turn an allowed request into an error.
   */
  async recordDecision(params: {
    recordingId: string;
    purpose: VdclPurpose;
    decision: RightsDecision;
    actorId?: string;
    detail?: string;
  }): Promise<void> {
    try {
      await this.prisma.vdclAuditEvent.create({
        data: {
          agreementId: params.decision.agreementId ?? null,
          versionId: params.decision.versionId ?? null,
          recordingId: params.recordingId,
          actorId: params.actorId ?? null,
          eventType: params.decision.allowed ? 'rights_allowed' : 'rights_denied',
          purpose: params.purpose,
          detail: params.detail ?? params.decision.reason ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write VDCL audit event for recording=${params.recordingId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
