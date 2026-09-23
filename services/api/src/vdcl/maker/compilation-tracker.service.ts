import { Injectable, NotFoundException } from '@nestjs/common';
import { VdclCompilationStage, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The pipeline the contributor sees, in order.
 *
 * Named exactly as the product plan's Stage 7 states them, because the
 * contributor was told this sequence when they submitted and a status
 * screen that uses different words reads as a different process.
 */
export const TRACKER_STAGES: { stage: VdclCompilationStage; label: string }[] = [
  { stage: VdclCompilationStage.SUBMITTED, label: 'Submitted' },
  { stage: VdclCompilationStage.INVENTORYING, label: 'Inventorying' },
  { stage: VdclCompilationStage.TRANSCRIPT_CHECK, label: 'Transcript check' },
  { stage: VdclCompilationStage.VALIDATION_CHECK, label: 'Validation check' },
  { stage: VdclCompilationStage.METRICS_CALCULATION, label: 'Metrics calculation' },
  { stage: VdclCompilationStage.COMPLIANCE_REVIEW, label: 'Compliance review' },
  { stage: VdclCompilationStage.COUNTERSIGNATURE, label: 'DL countersignature' },
  { stage: VdclCompilationStage.ISSUED, label: 'Issued' },
];

export type TrackerStageState = 'done' | 'current' | 'pending' | 'failed';

/**
 * Tracks a licence through compilation and review.
 *
 * The plan's requirement is blunt: do not leave the request in an
 * unexplained pending state. So this service never returns a bare
 * "processing". Every response carries which stage is current, what is
 * already done, and -- when something has stalled -- what is blocking it
 * and whether the contributor can do anything about it.
 *
 * The distinction that matters is between "waiting on us" and "waiting on
 * you". A contributor who thinks Dialect Library is working on something
 * that is actually waiting on their signature will wait indefinitely, which
 * is the failure this exists to prevent.
 */
@Injectable()
export class CompilationTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async track(versionId: string, contributorId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: { select: { contributorId: true, licenceKey: true, withdrawnAt: true } },
        compilationJob: true,
        manifest: { select: { recordingCount: true, compiledAt: true } },
      },
    });
    if (!version || version.agreement.contributorId !== contributorId) {
      throw new NotFoundException('VDCL version not found');
    }

    const currentStage = this.resolveStage(version.status, version.compilationJob?.stage ?? null);
    const failed = version.compilationJob?.stage === VdclCompilationStage.FAILED;
    const currentIndex = TRACKER_STAGES.findIndex((s) => s.stage === currentStage);

    const stages = TRACKER_STAGES.map((entry, index) => {
      let state: TrackerStageState;
      if (failed && index === currentIndex) state = 'failed';
      else if (index < currentIndex) state = 'done';
      else if (index === currentIndex) state = 'current';
      else state = 'pending';
      return { stage: entry.stage, label: entry.label, state };
    });

    const waiting = this.resolveWaiting(version.status, failed);

    return {
      versionId,
      licenceKey: version.agreement.licenceKey,
      status: version.status,
      stages,
      progressPercent: failed
        ? (version.compilationJob?.progressPercent ?? 0)
        : this.progressFor(currentIndex, version.status),
      /** Who the next move belongs to. */
      waitingOn: waiting.waitingOn,
      nextAction: waiting.nextAction,
      blockerMessage: version.compilationJob?.blockerMessage ?? null,
      failureReason: failed ? version.compilationJob?.failureReason ?? null : null,
      estimatedCompletionAt: version.compilationJob?.estimatedCompletionAt ?? null,
      compiledAt: version.manifest?.compiledAt ?? null,
      recordingCount: version.manifest?.recordingCount ?? null,
      signedAt: version.signedAt,
      countersignedAt: version.countersignedAt,
    };
  }

  /**
   * The version's status outranks the job's stage.
   *
   * The job stops at COMPLIANCE_REVIEW; everything after that is driven by
   * signature and countersignature, which live on the version. Reading the
   * job alone would leave a signed licence displaying "compliance review"
   * forever.
   */
  private resolveStage(
    status: VdclVersionStatus,
    jobStage: VdclCompilationStage | null,
  ): VdclCompilationStage {
    switch (status) {
      case VdclVersionStatus.ACTIVE:
      case VdclVersionStatus.SUPERSEDED:
        return VdclCompilationStage.ISSUED;
      case VdclVersionStatus.PENDING_COUNTERSIGNATURE:
        return VdclCompilationStage.COUNTERSIGNATURE;
      case VdclVersionStatus.PENDING_REVIEW:
        return VdclCompilationStage.COMPLIANCE_REVIEW;
      case VdclVersionStatus.DRAFT:
        return VdclCompilationStage.SUBMITTED;
      default:
        return jobStage ?? VdclCompilationStage.SUBMITTED;
    }
  }

  private progressFor(currentIndex: number, status: VdclVersionStatus): number {
    if (status === VdclVersionStatus.ACTIVE) return 100;
    if (currentIndex < 0) return 0;
    return Math.round((currentIndex / (TRACKER_STAGES.length - 1)) * 100);
  }

  /**
   * Whose move it is, in the contributor's own terms.
   *
   * "Waiting on you" with no stated action is the same dead end as an
   * unexplained spinner, so every contributor-side state names what to do.
   */
  private resolveWaiting(
    status: VdclVersionStatus,
    failed: boolean,
  ): { waitingOn: 'you' | 'dialect_library' | 'nobody'; nextAction: string | null } {
    if (failed) {
      return {
        waitingOn: 'dialect_library',
        nextAction: 'Compilation could not finish. Dialect Library is looking into it.',
      };
    }
    switch (status) {
      case VdclVersionStatus.PENDING_REVIEW:
        return {
          waitingOn: 'you',
          nextAction: 'Review your dataset and permissions, then sign.',
        };
      case VdclVersionStatus.PENDING_COUNTERSIGNATURE:
        return {
          waitingOn: 'dialect_library',
          nextAction: 'You have signed. Dialect Library countersigns after compliance review.',
        };
      case VdclVersionStatus.ACTIVE:
        return { waitingOn: 'nobody', nextAction: null };
      case VdclVersionStatus.REJECTED:
        return {
          waitingOn: 'dialect_library',
          nextAction: 'This version did not pass compliance review. Contact support.',
        };
      case VdclVersionStatus.SUSPENDED:
        return {
          waitingOn: 'dialect_library',
          nextAction: 'This licence is suspended pending review. Contact support.',
        };
      case VdclVersionStatus.WITHDRAWN:
        return { waitingOn: 'nobody', nextAction: 'You withdrew this licence.' };
      case VdclVersionStatus.DRAFT:
      case VdclVersionStatus.PENDING_COMPILATION:
        return {
          waitingOn: 'dialect_library',
          nextAction: 'Your recordings are being compiled. You will be able to sign once ready.',
        };
      default:
        return { waitingOn: 'dialect_library', nextAction: null };
    }
  }

  /** Every version on this contributor's agreements, newest first. */
  async listForContributor(contributorId: string) {
    const versions = await this.prisma.vdclVersion.findMany({
      where: { agreement: { contributorId } },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        agreement: { select: { licenceKey: true, withdrawnAt: true } },
        manifest: { select: { recordingCount: true, dialectTags: true } },
        compilationJob: { select: { stage: true, blockerMessage: true } },
      },
    });

    return versions.map((v) => ({
      versionId: v.id,
      version: v.version,
      status: v.status,
      licenceKey: v.agreement.licenceKey,
      dialectTags: v.manifest?.dialectTags ?? [],
      withdrawn: Boolean(v.agreement.withdrawnAt),
      recordingCount: v.manifest?.recordingCount ?? null,
      blockerMessage: v.compilationJob?.blockerMessage ?? null,
      signedAt: v.signedAt,
      countersignedAt: v.countersignedAt,
      createdAt: v.createdAt,
    }));
  }
}
