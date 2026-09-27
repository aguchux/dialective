import { Injectable, Logger } from '@nestjs/common';
import { StreamRecordKind, VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { kindKey } from '../../voice-stream/stream-record-kind.util';
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
  | 'recording_not_covered' // agreement is active but this clip is outside its frozen manifest
  | 'no_declared_purpose'; // the subscriber's credential declares no purpose to check against

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

/**
 * The purposes a credential declared, or a denial if it declared none.
 *
 * An undeclared credential is DENIED, never defaulted to a permissive
 * purpose. Guessing on the subscriber's behalf would let them stream data
 * for a use the contributor explicitly refused -- which is the exact failure
 * the itemised consent model exists to prevent.
 *
 * Credentials minted before this field existed carry an empty array, so
 * every one of them must be re-declared before enforcement is turned on.
 * That is deliberate: silently grandfathering them in would reintroduce the
 * same hole.
 */
export function declaredPurposes(credential: { purposes: VdclPurpose[] }): VdclPurpose[] {
  return credential.purposes ?? [];
}

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
/**
 * A record identified the only way it can be: kind plus id.
 *
 * Every rights entry point takes one of these rather than a bare string,
 * because `WordRecording` and `DomainConversationRecording` have independent
 * uuid spaces. A rights check resolved on the id alone could match the other
 * table's manifest item and answer with a different contributor's grants --
 * the one failure mode here that is worse than a wrong answer, because it
 * would be a confidently wrong one.
 */
export interface RecordRef {
  recordKind: StreamRecordKind;
  recordingId: string;
}

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
  async mayUse(ref: RecordRef, purpose: VdclPurpose): Promise<RightsDecision> {
    if (!(await this.settings.isVdclEnforcementEnabled())) {
      return ALLOWED;
    }
    const { recordKind, recordingId } = ref;

    // The manifest is the authority on coverage, not the recording's own
    // dialectTag or owner: a contributor's licence covers exactly the clips
    // frozen into its manifest at signing time, and nothing else. A recording
    // made after signing is not retroactively covered.
    const items = await this.prisma.vdclManifestItem.findMany({
      // recordKind is part of the key, not a filter refinement. Without it a
      // domain conversation could resolve against a word recording's licence
      // that happened to share its uuid -- answering a rights question with
      // the wrong contributor's grants.
      where: { recordKind, recordingId },
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
   * The form the stream API actually calls: may this credential's traffic
   * use this recording?
   *
   * A credential may declare several purposes (an org licensing for both ASR
   * and TTS work on one key). ALL declared purposes must be granted, not any
   * -- the credential is asserting what it intends to do with the data, and
   * a contributor who permitted ASR but refused TTS has not licensed a key
   * that does both. Taking "any" here would let one granted purpose smuggle
   * in every refused one.
   */
  async mayUseForCredential(
    ref: RecordRef,
    credential: { purposes: VdclPurpose[] },
  ): Promise<RightsDecision> {
    if (!(await this.settings.isVdclEnforcementEnabled())) {
      return ALLOWED;
    }

    const purposes = declaredPurposes(credential);
    if (purposes.length === 0) {
      return deny('no_declared_purpose');
    }

    let last: RightsDecision = ALLOWED;
    for (const purpose of purposes) {
      last = await this.mayUse(ref, purpose);
      if (!last.allowed) return last;
    }
    return last;
  }

  /**
   * Batch form, for manifest listings that would otherwise issue one query
   * per recording. Same semantics as mayUse, same fail-closed default: a
   * recordingId absent from the returned map is denied.
   */
  async mayUseMany(
    refs: RecordRef[],
    purpose: VdclPurpose,
  ): Promise<Map<string, RightsDecision>> {
    // Keyed by kindKey(kind, id), NOT bare id -- the two record tables have
    // independent uuid spaces, so a bare-id map could let one kind's decision
    // answer for the other's.
    const result = new Map<string, RightsDecision>();
    if (refs.length === 0) return result;

    if (await this.settings.isVdclEnforcementEnabled().then((on) => !on)) {
      for (const ref of refs) result.set(kindKey(ref.recordKind, ref.recordingId), ALLOWED);
      return result;
    }

    // One OR term per kind present, rather than an id-only `in` that would
    // match the other table's rows too.
    const kinds = [...new Set(refs.map((r) => r.recordKind))];
    const items = await this.prisma.vdclManifestItem.findMany({
      where: {
        OR: kinds.map((recordKind) => ({
          recordKind,
          recordingId: {
            in: refs.filter((r) => r.recordKind === recordKind).map((r) => r.recordingId),
          },
        })),
      },
      select: {
        recordKind: true,
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

    for (const ref of refs) result.set(kindKey(ref.recordKind, ref.recordingId), deny('no_vdcl'));

    for (const item of items) {
      const version = item.manifest.vdclVersion;
      const ids = { agreementId: version.agreementId, versionId: version.id };
      const key = kindKey(item.recordKind, item.recordingId);
      const current = result.get(key);
      if (current?.allowed) continue;

      if (version.agreement.withdrawnAt) {
        result.set(key, deny('licence_withdrawn', ids));
        continue;
      }
      if (version.status === VdclVersionStatus.SUSPENDED) {
        result.set(key, deny('licence_suspended', ids));
        continue;
      }
      if (
        version.status !== VdclVersionStatus.ACTIVE ||
        version.agreement.activeVersionId !== version.id
      ) {
        result.set(key, deny('licence_not_active', ids));
        continue;
      }
      if (!version.grants.some((g) => g.purpose === purpose)) {
        result.set(key, deny('purpose_not_granted', ids));
        continue;
      }
      result.set(key, { ...ALLOWED, ...ids });
    }

    return result;
  }

  /**
   * Batch form of mayUseForCredential, for filtering a deck manifest down to
   * what the subscriber may actually stream.
   *
   * A deck is normally PARTIALLY covered for any given purpose -- its
   * recordings come from different contributors who granted different
   * things. That is the expected case, not an error, so the manifest filters
   * rather than failing.
   */
  async filterUsableForCredential(
    refs: RecordRef[],
    credential: { purposes: VdclPurpose[] },
  ): Promise<Set<string>> {
    // Returns a Set of kindKey(kind, id), so callers test membership with the
    // same composite key rather than a bare id.
    if (!(await this.settings.isVdclEnforcementEnabled())) {
      return new Set(refs.map((r) => kindKey(r.recordKind, r.recordingId)));
    }

    const purposes = declaredPurposes(credential);
    if (purposes.length === 0) return new Set();
    if (refs.length === 0) return new Set();

    // Start from everything, then intersect per declared purpose -- a
    // recording survives only if EVERY declared purpose is granted, matching
    // mayUseForCredential's all-not-any rule.
    let usable = refs;
    for (const purpose of purposes) {
      const decisions = await this.mayUseMany(usable, purpose);
      usable = usable.filter((r) => decisions.get(kindKey(r.recordKind, r.recordingId))?.allowed);
      if (usable.length === 0) break;
    }
    return new Set(usable.map((r) => kindKey(r.recordKind, r.recordingId)));
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
    recordKind?: StreamRecordKind;
    recordingId: string;
    /** Undefined when the credential declared none -- the denial itself is what matters then. */
    purpose?: VdclPurpose;
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
          purpose: params.purpose ?? null,
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
