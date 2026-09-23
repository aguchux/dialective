import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { VdclCompilationService } from '../compilation/vdcl-compilation.service';
import { VdclDraftService } from '../compilation/vdcl-draft.service';
import { VdclReadinessService } from './readiness.service';
import { OFFERABLE_PURPOSES } from './dto/maker.dto';

/**
 * The contributor-facing VDCL Maker.
 *
 * Wraps the Phase 2 draft/compile services in the checks a contributor
 * flow needs and the admin path does not: readiness gating, consent
 * evidence capture, and the contributor's own dialect rather than one
 * passed in.
 *
 * The dialect is NEVER taken from the request. It is read from the
 * contributor's profile, because a request body naming a dialect would let
 * someone license recordings under a dialect they do not record in --
 * turning a scoping decision into an input.
 */
@Injectable()
export class VdclMakerService {
  private readonly logger = new Logger(VdclMakerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: VdclReadinessService,
    private readonly drafts: VdclDraftService,
    private readonly compilation: VdclCompilationService,
  ) {}

  /**
   * Start a licence: check readiness, create the draft with consent
   * evidence, then compile it.
   *
   * Compilation runs inline rather than being queued. At current volumes a
   * contributor's inventory is a few thousand rows, and an inline run means
   * they see a real result instead of a pending state -- which is what the
   * plan asks for. If inventories grow enough for this to stall a request,
   * the tracker and job row are already in place to move it to a worker
   * without changing the contributor-facing shape.
   */
  async startDraft(params: {
    contributorId: string;
    purposes: VdclPurpose[];
    wordingVersion: string;
    termsVersion?: string;
    locale?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const refused = params.purposes.filter((p) => !OFFERABLE_PURPOSES.includes(p));
    if (refused.length > 0) {
      // Server-side, not just absent from the screen. A purpose that is
      // never offered must be refused by the API too, or the policy only
      // holds for people using the UI as intended.
      throw new BadRequestException(`These purposes are not offered: ${refused.join(', ')}`);
    }

    const readiness = await this.readiness.check(params.contributorId);
    if (!readiness.ready) {
      throw new ForbiddenException({
        message: 'This account is not ready to sign a licence yet.',
        blockers: readiness.blockers,
      });
    }

    const { agreement, version } = await this.drafts.createDraft({
      contributorId: params.contributorId,
      purposes: params.purposes,
      wordingVersion: params.wordingVersion,
      termsVersion: params.termsVersion,
    });

    // Consent evidence is attached AFTER the grants exist, per the plan's
    // Stage 4 requirement to record locale and coarse session evidence
    // alongside each permission. It is written as a separate update rather
    // than inline so a failure here cannot lose the draft itself -- though
    // it is inside the same request, so a caller sees any error.
    await this.prisma.vdclConsentGrant.updateMany({
      where: { versionId: version.id },
      data: {
        locale: params.locale ?? null,
        userAgent: params.userAgent ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });

    let compilation: Awaited<ReturnType<VdclCompilationService['compileVersion']>> | null = null;
    let compilationError: string | null = null;
    try {
      compilation = await this.compilation.compileVersion(version.id);
    } catch (err) {
      // The draft survives a failed compilation. The tracker reads the job
      // row and tells the contributor what happened, which is the whole
      // point of not leaving a request in an unexplained state.
      compilationError = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `VDCL draft ${version.id} created but compilation failed: ${compilationError}`,
      );
    }

    return {
      agreementId: agreement.id,
      licenceKey: agreement.licenceKey,
      versionId: version.id,
      version: version.version,
      dialectTags: readiness.dialectTags,
      compiled: compilation !== null,
      compilationError,
      recordingCount: compilation?.recordingCount ?? null,
      excludedCount: compilation?.excludedCount ?? null,
      manifestHash: compilation?.manifestHash ?? null,
    };
  }

  /**
   * Abandon an unsigned draft.
   *
   * Only DRAFT or PENDING_REVIEW, and only before signing. Once signed, the
   * contributor is bound and the route out is withdrawal -- a deliberate,
   * recorded act -- not deleting the evidence that it happened.
   */
  async discardDraft(versionId: string, contributorId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        status: true,
        signedAt: true,
        agreementId: true,
        version: true,
        agreement: { select: { contributorId: true } },
      },
    });
    if (!version || version.agreement.contributorId !== contributorId) {
      throw new BadRequestException('VDCL version not found');
    }
    if (version.signedAt) {
      throw new BadRequestException(
        'You have already signed this version. To end it, request a withdrawal.',
      );
    }
    if (
      version.status !== VdclVersionStatus.DRAFT &&
      version.status !== VdclVersionStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException(`This version cannot be discarded (it is ${version.status}).`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vdclVersion.update({
        where: { id: versionId },
        data: { status: VdclVersionStatus.REJECTED },
      });
      await tx.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId,
          actorId: contributorId,
          eventType: 'status_change',
          detail: `contributor discarded unsigned version ${version.version}`,
        },
      });
      return { versionId: updated.id, status: updated.status };
    });
  }
}
