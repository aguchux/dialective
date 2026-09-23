import { Injectable, Logger } from '@nestjs/common';
import { VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { HASH_PREFIX_LEN, readVerificationToken } from './verification-token.util';
import { contributorShortId } from '../compilation/vdcl-keys';

export type VerificationOutcome =
  | 'valid'
  | 'suspended'
  | 'withdrawn'
  | 'superseded'
  | 'not_yet_active'
  | 'hash_mismatch'
  | 'unknown';

/**
 * What a member of the public sees when they scan a certificate.
 *
 * Every field here was chosen by asking "does a stranger holding this
 * document need it to judge whether the licence is real?" -- not "what do
 * we have?". The contributor's name, email, photo, KYC reference and the
 * recording ids are all absent, and their absence is the feature.
 */
export interface PublicVerification {
  outcome: VerificationOutcome;
  licenceKey: string | null;
  version: number | null;
  issuedAt: Date | null;
  /**
   * The dialects this VERSION covers. Same class of information as the
   * single dialect it replaced -- it describes the dataset, not the person
   * -- so it stays inside the anonymity boundary this interface enforces.
   */
  dialectTags: string[];
  country: string | null;
  /** Derived, never the contributor's name -- see contributorLabel below. */
  contributorLabel: string | null;
  recordingCount: number | null;
  totalDurationMs: string | null;
  transcriptCount: number | null;
  purposes: string[];
  hashMatches: boolean;
}

/**
 * Public QR verification.
 *
 * The question this answers is narrow on purpose: "is this document real,
 * and is the licence it describes still in force?" It deliberately does not
 * answer "whose licence is it?".
 *
 * That restraint is the mutual-anonymity boundary reaching its most exposed
 * surface. A certificate may be printed, photographed or attached to a
 * dataset sold onward; whatever this endpoint returns should be assumed to
 * be public forever. A subscriber verifying provenance needs to know the
 * licence is valid and covers the data -- they have never needed to know
 * who recorded it, and this is the one place where handing that over would
 * be easiest to justify and hardest to undo.
 */
@Injectable()
export class VdclVerificationService {
  private readonly logger = new Logger(VdclVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A stable, privacy-safe label for the contributor.
   *
   * Derived from the licence key, which already contains the truncated
   * contributor short id. It is deliberately NOT a name or a pseudonym a
   * contributor chose: a self-chosen handle tends to be reused elsewhere,
   * which would let a determined subscriber correlate a licence back to a
   * real person through an unrelated service.
   */
  private label(contributorId: string): string {
    return `Contributor ${contributorShortId(contributorId).slice(0, 6)}`;
  }

  async verify(token: string): Promise<PublicVerification> {
    const empty: PublicVerification = {
      outcome: 'unknown',
      licenceKey: null,
      version: null,
      issuedAt: null,
      dialectTags: [],
      country: null,
      contributorLabel: null,
      recordingCount: null,
      totalDurationMs: null,
      transcriptCount: null,
      purposes: [],
      hashMatches: false,
    };

    const payload = readVerificationToken(token);
    if (!payload) return empty;

    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: payload.v },
      include: {
        agreement: {
          select: {
            licenceKey: true,
            contributorId: true,
            withdrawnAt: true,
            activeVersionId: true,
            country: { select: { name: true } },
          },
        },
        manifest: {
          select: {
            recordingCount: true,
            totalDurationMs: true,
            transcriptCount: true,
            dialectTags: true,
          },
        },
        grants: { select: { purpose: true } },
      },
    });
    if (!version || !version.manifestHash) return empty;

    // The document asserted a hash. If the licence's actual manifest hash
    // no longer starts with it, the document describes something other than
    // what is on file -- which is exactly what a forged or edited
    // certificate looks like.
    const hashMatches =
      version.manifestHash.slice(0, HASH_PREFIX_LEN) === payload.h &&
      version.version === payload.n;

    const outcome = hashMatches
      ? this.outcomeFor(version.status, version.agreement.withdrawnAt)
      : 'hash_mismatch';

    await this.recordScan(version.id, outcome);

    if (!hashMatches) {
      // A mismatch discloses nothing about the real licence. Confirming
      // which fields differ would help someone iterate toward a forgery
      // that passes.
      return { ...empty, outcome: 'hash_mismatch' };
    }

    return {
      outcome,
      licenceKey: version.agreement.licenceKey,
      version: version.version,
      issuedAt: version.countersignedAt ?? version.effectiveFrom,
      dialectTags: version.manifest?.dialectTags ?? [],
      country: version.agreement.country?.name ?? null,
      contributorLabel: this.label(version.agreement.contributorId),
      recordingCount: version.manifest?.recordingCount ?? null,
      totalDurationMs: version.manifest?.totalDurationMs.toString() ?? null,
      transcriptCount: version.manifest?.transcriptCount ?? null,
      purposes: version.grants.map((g) => g.purpose),
      hashMatches: true,
    };
  }

  private outcomeFor(
    status: VdclVersionStatus,
    withdrawnAt: Date | null,
  ): VerificationOutcome {
    // Withdrawal outranks status: it is the contributor's own decision, and
    // a scanner must see it even if a version's status row lags behind.
    if (withdrawnAt) return 'withdrawn';
    switch (status) {
      case VdclVersionStatus.ACTIVE:
        return 'valid';
      case VdclVersionStatus.SUSPENDED:
        return 'suspended';
      case VdclVersionStatus.WITHDRAWN:
        return 'withdrawn';
      case VdclVersionStatus.SUPERSEDED:
        return 'superseded';
      default:
        // Signed but not yet countersigned, draft, rejected -- none of
        // these grant rights, and a certificate should never read as valid
        // before Dialect Library has countersigned.
        return 'not_yet_active';
    }
  }

  /**
   * Log the scan, without identifying the scanner.
   *
   * Scans are worth counting -- an unexpected burst against one licence is
   * a signal -- but the plan's "privacy-minimised" requirement cuts both
   * ways. Storing the scanner's IP would build a record of who examined
   * whose licence, which is surveillance of subscribers rather than
   * protection of contributors.
   */
  private async recordScan(versionId: string, outcome: VerificationOutcome): Promise<void> {
    try {
      await this.prisma.vdclAuditEvent.create({
        data: {
          versionId,
          eventType: 'verification_scan',
          detail: outcome,
        },
      });
    } catch (err) {
      // A failed audit write must never break verification -- the scanner's
      // question is legitimate and answering it matters more than the log.
      this.logger.warn(
        `Failed to log VDCL verification scan: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
