import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ELIGIBILITY_SELECT,
  EXCLUSION_REASON_LABELS,
  EligibilityCandidate,
  ExclusionReason,
  classify,
  isTransient,
} from './eligibility';
import {
  CanonicalManifestItem,
  canonicalDecimal,
  hashManifest,
} from './manifest-hash';

const PAGE_SIZE = 200;

/**
 * The admin manifest inspector.
 *
 * Phase 2's acceptance criterion is that an admin can explain every included
 * and excluded recording. This is the surface that makes that true, and it
 * answers two different questions:
 *
 * - **What is in this manifest, and why?** Item-level listing with scores
 *   and transcript status.
 * - **What was left out, and why?** Re-runs `classify` over the
 *   contributor's full inventory and reports each exclusion with its reason.
 *
 * The exclusions are recomputed rather than stored per-clip. That is a
 * deliberate trade: storing one row per excluded recording would have meant
 * hundreds of thousands of rows carrying no rights, and the reason for an
 * exclusion is a pure function of the recording's current state anyway. The
 * cost is that a recording whose state CHANGED since compilation now reports
 * its current reason, not the one that applied on the day -- which is
 * flagged in the response as `recomputedAt` so an admin reading it knows
 * they are looking at today's answer.
 */
@Injectable()
export class ManifestInspectorService {
  constructor(private readonly prisma: PrismaService) {}

  async inspect(versionId: string, page = 0) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: {
          select: {
            id: true,
            licenceKey: true,
            contributorId: true,
            countryId: true,
            withdrawnAt: true,
            country: { select: { code: true, name: true } },
          },
        },
        manifest: true,
        grants: { select: { purpose: true } },
        compilationJob: true,
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (!version.manifest) {
      return {
        versionId,
        status: version.status,
        manifest: null,
        compilationJob: version.compilationJob,
        message: 'This version has not been compiled yet.',
      };
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.vdclManifestItem.findMany({
        where: { manifestId: version.manifest.id },
        orderBy: { recordingId: 'asc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.vdclManifestItem.count({ where: { manifestId: version.manifest.id } }),
    ]);

    // A non-null audioPurgedAt means retention deleted audio this licence
    // covers. Under the current design that should be impossible (licensed
    // audio is retention-exempt), so it is surfaced as an anomaly rather
    // than shown as a routine column value.
    const purgedCount = await this.prisma.vdclManifestItem.count({
      where: { manifestId: version.manifest.id, audioPurgedAt: { not: null } },
    });

    return {
      versionId,
      status: version.status,
      licenceKey: version.agreement.licenceKey,
      // From the manifest, not the agreement: the agreement covers whatever
      // the contributor records, while each version covers a specific set.
      dialectTags: version.manifest?.dialectTags ?? [],
      country: version.agreement.country,
      purposes: version.grants.map((g) => g.purpose),
      manifest: {
        ...version.manifest,
        totalDurationMs: version.manifest.totalDurationMs.toString(),
      },
      manifestHash: version.manifestHash,
      compilationJob: version.compilationJob,
      anomalies: purgedCount > 0
        ? [
            {
              kind: 'audio_purged_despite_licence',
              count: purgedCount,
              detail:
                'Audio covered by this licence was deleted by the retention job. Licensed audio is meant to be retention-exempt, so this indicates the exemption was off or failed.',
            },
          ]
        : [],
      items: items.map((i) => ({
        ...i,
        compositeScore: i.compositeScore?.toString() ?? null,
        score: i.score?.toString() ?? null,
      })),
      page,
      pageSize: PAGE_SIZE,
      totalItems,
    };
  }

  /**
   * Every recording the contributor owns that did NOT make it in, each with
   * a stated reason.
   *
   * Separated from `inspect` because it scans the contributor's whole
   * inventory rather than reading the manifest, so it is the expensive half
   * and should not be paid for on every manifest view.
   */
  async explainExclusions(versionId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: { select: { contributorId: true } },
        manifest: { select: { id: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }

    const coveredIds = version.manifest
      ? new Set(
          (
            await this.prisma.vdclManifestItem.findMany({
              where: { manifestId: version.manifest.id },
              select: { recordingId: true },
            })
          ).map((i) => i.recordingId),
        )
      : new Set<string>();

    const byReason = new Map<
      ExclusionReason,
      { count: number; sampleRecordingIds: string[] }
    >();
    let coveredSeen = 0;
    // Eligible today but absent from the manifest: recorded after the
    // manifest was frozen. Not a defect -- it is exactly what a new version
    // exists to pick up -- but an admin needs to see it to answer "why
    // isn't my latest work licensed?".
    let eligibleButNotInManifest = 0;

    let cursor: string | undefined;
    for (;;) {
      const batch = (await this.prisma.wordRecording.findMany({
        where: { userId: version.agreement.contributorId },
        select: ELIGIBILITY_SELECT,
        orderBy: { id: 'asc' },
        take: 2_000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })) as EligibilityCandidate[];
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const recording of batch) {
        const outcome = classify(recording, version.agreement);
        if (outcome.eligible) {
          if (coveredIds.has(recording.id)) {
            coveredSeen += 1;
          } else {
            eligibleButNotInManifest += 1;
          }
          continue;
        }
        const reason = outcome.reason as ExclusionReason;
        if (reason === 'wrong_contributor') continue;
        const entry = byReason.get(reason) ?? { count: 0, sampleRecordingIds: [] };
        entry.count += 1;
        if (entry.sampleRecordingIds.length < 10) {
          entry.sampleRecordingIds.push(recording.id);
        }
        byReason.set(reason, entry);
      }
      if (batch.length < 2_000) break;
    }

    return {
      versionId,
      recomputedAt: new Date(),
      coveredInManifest: coveredIds.size,
      coveredStillEligible: coveredSeen,
      // Covered clips that would NOT pass eligibility today. The licence
      // still covers them -- a signed manifest does not shrink because a
      // clip's state changed afterwards -- but it is worth an admin knowing.
      coveredNoLongerEligible: coveredIds.size - coveredSeen,
      eligibleButNotInManifest,
      exclusions: [...byReason.entries()]
        .map(([reason, entry]) => ({
          reason,
          label: EXCLUSION_REASON_LABELS[reason],
          transient: isTransient(reason),
          count: entry.count,
          sampleRecordingIds: entry.sampleRecordingIds,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Recompute the manifest hash from its stored rows and compare.
   *
   * This is the check that makes the hash worth printing on a document. If
   * a manifest's stored rows were ever edited -- by a migration, a repair
   * script, a bug -- the recomputed hash diverges and this says so, rather
   * than the discrepancy surfacing years later when a subscriber tries to
   * verify a certificate.
   */
  async verifyHash(versionId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: {
          select: {
            licenceKey: true,
            contributorId: true,
            countryId: true,
          },
        },
        manifest: { include: { items: true } },
        grants: { select: { purpose: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (!version.manifest) {
      throw new NotFoundException('This version has no manifest to verify');
    }

    const items: CanonicalManifestItem[] = version.manifest.items.map((i) => ({
      recordingId: i.recordingId,
      durationMs: i.durationMs,
      dialectTag: i.dialectTag,
      compositeScore: canonicalDecimal(i.compositeScore),
      score: canonicalDecimal(i.score),
      hasTranscript: i.hasTranscript,
    }));

    const recomputed = hashManifest({
      manifestKey: version.manifest.manifestKey,
      licenceKey: version.agreement.licenceKey,
      version: version.version,
      contributorId: version.agreement.contributorId,
      // Read back from the stored manifest, exactly as compilation wrote
      // it. Deriving this from the agreement instead would make verification
      // disagree with compilation the moment a contributor records a new
      // dialect -- every previously-issued document would start failing its
      // own hash check.
      dialectTags: version.manifest.dialectTags,
      countryId: version.agreement.countryId,
      recordingCount: version.manifest.recordingCount,
      totalDurationMs: version.manifest.totalDurationMs.toString(),
      transcriptCount: version.manifest.transcriptCount,
      excludedCount: version.manifest.excludedCount,
      meanCompositeScore: canonicalDecimal(version.manifest.meanCompositeScore),
      asrPipelineVersion: version.manifest.asrPipelineVersion,
      qualityPipelineVersion: version.manifest.qualityPipelineVersion,
      purposes: version.grants.map((g) => g.purpose),
      items,
    });

    return {
      versionId,
      storedHash: version.manifestHash,
      recomputedHash: recomputed,
      matches: version.manifestHash === recomputed,
    };
  }
}
