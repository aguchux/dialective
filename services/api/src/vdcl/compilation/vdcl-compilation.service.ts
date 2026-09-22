import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, VdclCompilationStage, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ELIGIBILITY_SELECT,
  EligibilityCandidate,
  ExclusionReason,
  classify,
} from './eligibility';
import {
  CanonicalManifestItem,
  canonicalDecimal,
  hashManifest,
} from './manifest-hash';
import { buildManifestKey } from './vdcl-keys';

/** How many recordings are pulled into memory at once. */
const INVENTORY_BATCH_SIZE = 2_000;

/**
 * Metric definitions carried with the numbers.
 *
 * The plan is explicit that a score shown to a contributor must carry its
 * definition inline. A "mean composite score of 71.4" is not information
 * unless the reader knows what was blended into it -- and a contributor
 * deciding whether to license their work is exactly the reader least likely
 * to have that context.
 */
const SCORE_DEFINITIONS: Record<string, string> = {
  recordingCount: 'Recordings covered by this licence, after exclusions.',
  totalDurationMs: 'Summed duration of the covered recordings, as measured at submission.',
  transcriptCount: 'How many covered recordings carry an ASR transcript.',
  excludedCount: 'Recordings reviewed but left out, each with a stated reason.',
  meanCompositeScore:
    'Average platform quality score of the covered recordings (0-100), blending accuracy, noise, clarity and liveness.',
};

export interface CompilationResult {
  versionId: string;
  manifestId: string;
  manifestKey: string;
  manifestHash: string;
  recordingCount: number;
  excludedCount: number;
  exclusionsByReason: Record<string, number>;
}

/**
 * Compiles a contributor's eligible recordings into an immutable manifest.
 *
 * This is the step that turns "this person has recorded for us" into "this
 * licence covers exactly these clips". Three properties are load-bearing:
 *
 * 1. **Immutable.** A manifest is written once. Recompiling produces a NEW
 *    version, never a mutation of an existing one -- because the old one has
 *    been signed, and a signature over a document that can change afterwards
 *    means nothing.
 *
 * 2. **Explainable.** Every recording the contributor owns in this dialect
 *    is accounted for: covered, or excluded with a reason. That is the
 *    phase's acceptance criterion, and it is why exclusions are counted and
 *    persisted rather than being discovered by a query that returns nothing.
 *
 * 3. **Reproducible.** The hash is computed over a canonical form (see
 *    manifest-hash.ts), so the same inputs yield the same hash on any
 *    machine, at any time.
 *
 * It deliberately does NOT sign, countersign, or activate anything. It
 * produces a manifest and moves the version to PENDING_REVIEW. A human
 * decides what happens next.
 */
@Injectable()
export class VdclCompilationService {
  private readonly logger = new Logger(VdclCompilationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compile one version's manifest.
   *
   * Only a version in DRAFT or PENDING_COMPILATION may be compiled. An ACTIVE
   * version is already signed and its manifest is what the signature covers,
   * so recompiling it in place would retroactively change what the
   * contributor agreed to.
   */
  async compileVersion(versionId: string): Promise<CompilationResult> {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: { include: { country: { select: { code: true } } } },
        manifest: { select: { id: true } },
        grants: { select: { purpose: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (
      version.status !== VdclVersionStatus.DRAFT &&
      version.status !== VdclVersionStatus.PENDING_COMPILATION
    ) {
      throw new BadRequestException(
        `Only a draft or pending-compilation version can be compiled (this one is ${version.status})`,
      );
    }
    if (version.manifest) {
      // A manifest is the thing a signature covers. Replacing one in place
      // would mean the contributor signed a different document than the one
      // now on file.
      throw new BadRequestException(
        'This version already has a manifest. Compile a new version instead of recompiling this one.',
      );
    }
    if (version.agreement.withdrawnAt) {
      throw new BadRequestException(
        'This agreement has been withdrawn by the contributor and cannot be compiled',
      );
    }

    const job = await this.startJob(versionId);

    try {
      const result = await this.runCompilation(version, job.id);
      await this.prisma.vdclCompilationJob.update({
        where: { id: job.id },
        data: {
          stage: VdclCompilationStage.COMPLIANCE_REVIEW,
          progressPercent: 100,
          completedAt: new Date(),
          blockerMessage: null,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.vdclCompilationJob.update({
        where: { id: job.id },
        data: {
          stage: VdclCompilationStage.FAILED,
          failedAt: new Date(),
          failureReason: message,
          // The plan is explicit that a request must never sit in an
          // unexplained pending state. A failure the contributor cannot see
          // is exactly that.
          blockerMessage: 'Compilation could not finish. Dialect Library has been notified.',
        },
      });
      this.logger.error(`VDCL compilation failed for version ${versionId}: ${message}`);
      throw err;
    }
  }

  private async startJob(versionId: string) {
    const existing = await this.prisma.vdclCompilationJob.findUnique({ where: { versionId } });
    if (existing) {
      return this.prisma.vdclCompilationJob.update({
        where: { versionId },
        data: {
          stage: VdclCompilationStage.INVENTORYING,
          progressPercent: 0,
          startedAt: new Date(),
          failedAt: null,
          failureReason: null,
          blockerMessage: null,
          attempts: { increment: 1 },
        },
      });
    }
    return this.prisma.vdclCompilationJob.create({
      data: {
        versionId,
        stage: VdclCompilationStage.INVENTORYING,
        startedAt: new Date(),
        attempts: 1,
      },
    });
  }

  private async stage(jobId: string, stage: VdclCompilationStage, progressPercent: number) {
    await this.prisma.vdclCompilationJob.update({
      where: { id: jobId },
      data: { stage, progressPercent },
    });
  }

  private async runCompilation(
    version: {
      id: string;
      version: number;
      agreementId: string;
      agreement: {
        contributorId: string;
        dialectTag: string;
        countryId: string | null;
        licenceKey: string;
        country: { code: string } | null;
      };
      grants: { purpose: string }[];
    },
    jobId: string,
  ): Promise<CompilationResult> {
    const { agreement } = version;

    await this.stage(jobId, VdclCompilationStage.INVENTORYING, 10);

    // Inventory EVERY recording this contributor owns, not just the ones
    // that look eligible. The excluded ones have to be counted and explained,
    // which a filtered query cannot do.
    const covered: CanonicalManifestItem[] = [];
    const itemRows: Prisma.VdclManifestItemCreateManyManifestInput[] = [];
    const exclusionsByReason: Record<string, number> = {};
    let totalDurationMs = 0n;
    let transcriptCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    const asrEngines = new Set<string>();

    let cursor: string | undefined;
    for (;;) {
      const batch = (await this.prisma.wordRecording.findMany({
        where: { userId: agreement.contributorId },
        select: { ...ELIGIBILITY_SELECT, asrEngine: true, qualityGateCheckedAt: true },
        orderBy: { id: 'asc' },
        take: INVENTORY_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })) as (EligibilityCandidate & {
        asrEngine: string | null;
        qualityGateCheckedAt: Date | null;
      })[];
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const recording of batch) {
        const outcome = classify(recording, {
          contributorId: agreement.contributorId,
          dialectTag: agreement.dialectTag,
        });
        if (!outcome.eligible) {
          const reason = outcome.reason as ExclusionReason;
          // A recording belonging to another dialect is not an "exclusion"
          // from this licence in any sense the contributor would recognise
          // -- it simply is not in scope. Counting it would inflate the
          // rejection figure on their review screen with work that is
          // perfectly fine and covered by a different licence.
          if (reason !== 'dialect_mismatch' && reason !== 'wrong_contributor') {
            exclusionsByReason[reason] = (exclusionsByReason[reason] ?? 0) + 1;
          }
          continue;
        }

        const hasTranscript = Boolean(recording.transcript);
        if (hasTranscript) transcriptCount += 1;
        if (recording.durationMs) totalDurationMs += BigInt(recording.durationMs);
        if (recording.asrEngine) asrEngines.add(recording.asrEngine);

        const composite = recording.compositeScore ?? recording.score;
        if (composite !== null) {
          scoreSum += Number(composite.toString());
          scoreCount += 1;
        }

        covered.push({
          recordingId: recording.id,
          durationMs: recording.durationMs,
          dialectTag: recording.dialectTag,
          compositeScore: canonicalDecimal(recording.compositeScore),
          score: canonicalDecimal(recording.score),
          hasTranscript,
        });
        itemRows.push({
          recordingId: recording.id,
          durationMs: recording.durationMs,
          dialectTag: recording.dialectTag,
          compositeScore: recording.compositeScore,
          score: recording.score,
          hasTranscript,
        });
      }

      if (batch.length < INVENTORY_BATCH_SIZE) break;
    }

    await this.stage(jobId, VdclCompilationStage.TRANSCRIPT_CHECK, 40);
    await this.stage(jobId, VdclCompilationStage.VALIDATION_CHECK, 55);
    await this.stage(jobId, VdclCompilationStage.METRICS_CALCULATION, 70);

    if (covered.length === 0) {
      // An empty manifest would read as a valid licence granting rights over
      // nothing, and would be signed as such. Refusing is the honest outcome:
      // there is nothing here to license yet.
      throw new BadRequestException(
        'No eligible recordings were found for this contributor and dialect, so there is nothing to license',
      );
    }

    const excludedCount = Object.values(exclusionsByReason).reduce((a, b) => a + b, 0);
    const meanCompositeScore = scoreCount > 0 ? scoreSum / scoreCount : null;
    const manifestKey = buildManifestKey({
      countryCode: agreement.country?.code,
      dialectTag: agreement.dialectTag,
      contributorId: agreement.contributorId,
      version: version.version,
    });

    const manifestHash = hashManifest({
      manifestKey,
      licenceKey: agreement.licenceKey,
      version: version.version,
      contributorId: agreement.contributorId,
      dialectTag: agreement.dialectTag,
      countryId: agreement.countryId,
      recordingCount: covered.length,
      totalDurationMs: totalDurationMs.toString(),
      transcriptCount,
      excludedCount,
      meanCompositeScore:
        meanCompositeScore === null ? null : meanCompositeScore.toFixed(2),
      // Pipeline versions are derived from the clips themselves rather than
      // read from config, because what matters is which engine actually
      // produced these transcripts -- not which one is configured today.
      asrPipelineVersion: asrEngines.size > 0 ? [...asrEngines].sort().join('+') : null,
      qualityPipelineVersion: null,
      purposes: version.grants.map((g) => g.purpose),
      items: covered,
    });

    const manifest = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vdclManifest.create({
        data: {
          versionId: version.id,
          manifestKey,
          recordingCount: covered.length,
          totalDurationMs,
          transcriptCount,
          excludedCount,
          meanCompositeScore:
            meanCompositeScore === null
              ? null
              : new Prisma.Decimal(meanCompositeScore.toFixed(2)),
          asrPipelineVersion: asrEngines.size > 0 ? [...asrEngines].sort().join('+') : null,
          qualityPipelineVersion: null,
          scoreDefinitions: SCORE_DEFINITIONS,
          items: { createMany: { data: itemRows } },
        },
      });
      await tx.vdclVersion.update({
        where: { id: version.id },
        data: { status: VdclVersionStatus.PENDING_REVIEW, manifestHash },
      });
      await tx.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId: version.id,
          eventType: 'compiled',
          detail: `${covered.length} recordings covered, ${excludedCount} excluded`,
          metadata: {
            manifestKey,
            manifestHash,
            recordingCount: covered.length,
            excludedCount,
            exclusionsByReason,
          },
        },
      });
      return created;
    });

    await this.stage(jobId, VdclCompilationStage.COMPLIANCE_REVIEW, 90);

    return {
      versionId: version.id,
      manifestId: manifest.id,
      manifestKey,
      manifestHash,
      recordingCount: covered.length,
      excludedCount,
      exclusionsByReason,
    };
  }

  /**
   * What a contributor would get if they compiled right now, without
   * compiling.
   *
   * This backs the readiness check and the review screen. It runs the same
   * `classify` as the real compilation, so the preview cannot disagree with
   * the outcome -- a preview that promises 400 clips and delivers 300 is
   * worse than no preview.
   */
  async previewInventory(params: { contributorId: string; dialectTag: string }): Promise<{
    eligibleCount: number;
    excludedCount: number;
    exclusionsByReason: Record<string, number>;
    totalDurationMs: string;
    transcriptCount: number;
    meanCompositeScore: number | null;
  }> {
    const exclusionsByReason: Record<string, number> = {};
    let eligibleCount = 0;
    let transcriptCount = 0;
    let totalDurationMs = 0n;
    let scoreSum = 0;
    let scoreCount = 0;

    let cursor: string | undefined;
    for (;;) {
      const batch = (await this.prisma.wordRecording.findMany({
        where: { userId: params.contributorId },
        select: ELIGIBILITY_SELECT,
        orderBy: { id: 'asc' },
        take: INVENTORY_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })) as EligibilityCandidate[];
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const recording of batch) {
        const outcome = classify(recording, {
          contributorId: params.contributorId,
          dialectTag: params.dialectTag,
        });
        if (!outcome.eligible) {
          const reason = outcome.reason as ExclusionReason;
          if (reason !== 'dialect_mismatch' && reason !== 'wrong_contributor') {
            exclusionsByReason[reason] = (exclusionsByReason[reason] ?? 0) + 1;
          }
          continue;
        }
        eligibleCount += 1;
        if (recording.transcript) transcriptCount += 1;
        if (recording.durationMs) totalDurationMs += BigInt(recording.durationMs);
        const composite = recording.compositeScore ?? recording.score;
        if (composite !== null) {
          scoreSum += Number(composite.toString());
          scoreCount += 1;
        }
      }
      if (batch.length < INVENTORY_BATCH_SIZE) break;
    }

    return {
      eligibleCount,
      excludedCount: Object.values(exclusionsByReason).reduce((a, b) => a + b, 0),
      exclusionsByReason,
      totalDurationMs: totalDurationMs.toString(),
      transcriptCount,
      meanCompositeScore: scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(2)) : null,
    };
  }
}
