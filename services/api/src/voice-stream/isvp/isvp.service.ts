import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ValidationAuditAction, ValidationReviewStatus, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamsService } from '../../redis-streams/redis-streams.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { WebhookEventService } from '../webhooks/webhook-event.service';

const ISVC_STREAM = process.env.ISVC_STREAM ?? 'isvc-jobs';

/**
 * Independent Subscriber Validation Programme (ISVP). A validation is
 * owned by (organizationId, userId, recordingId) -- resubmission by the
 * same validator overwrites rather than creating a second row. Every
 * validation goes through org-internal peer review before it counts
 * toward ISVC: submissions start PENDING, and an OWNER/ADMIN/
 * DATASET_MANAGER within the SAME org (never the submitter, never a
 * Dialect Library platform admin) approves or rejects it. Only APPROVED
 * rows feed OrganizationValidationConsensus (see isvc-scorer's
 * refreshOrgConsensus) -- a REJECTED row stays visible to its author with
 * a reason, but never influences the public ISVS. Recalculation of the
 * ISVC consensus happens out-of-band in services/isvc-scorer, consuming
 * the isvc-jobs Redis stream this service publishes to on every approval
 * (docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md section 52).
 */
@Injectable()
export class IsvpService {
  private readonly logger = new Logger(IsvpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: RedisStreamsService,
    private readonly catalogue: CatalogueService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  async submit(
    organizationId: string,
    userId: string,
    recordingId: string,
    dto: SubmitValidationDto,
  ) {
    const eligible = await this.catalogue.isEligible(recordingId);
    if (!eligible) {
      throw new NotFoundException('Recording not found or not available for Voice Stream');
    }

    const existing = await this.prisma.subscriberValidation.findUnique({
      where: { organizationId_userId_recordingId: { organizationId, userId, recordingId } },
      select: { id: true },
    });

    const data = {
      transcriptAccuracy: dto.transcriptAccuracy,
      pronunciationAccuracy: dto.pronunciationAccuracy,
      dialectAuthenticity: dto.dialectAuthenticity,
      speechClarity: dto.speechClarity,
      audioQuality: dto.audioQuality,
      overallScore: dto.overallScore,
      notes: dto.notes ?? null,
      // A changed score needs fresh peer review -- resubmission always
      // resets to PENDING and clears any prior review, even if the last
      // review was APPROVED.
      status: ValidationReviewStatus.PENDING,
      reviewedByUserId: null,
      reviewedAt: null,
      rejectionReason: null,
    };

    const validation = await this.prisma.subscriberValidation.upsert({
      where: {
        organizationId_userId_recordingId: { organizationId, userId, recordingId },
      },
      update: data,
      create: { organizationId, userId, recordingId, ...data },
    });

    await this.prisma.validationAuditLog.create({
      data: {
        validationId: validation.id,
        action: existing ? ValidationAuditAction.RESUBMITTED : ValidationAuditAction.SUBMITTED,
        actorUserId: userId,
      },
    });

    void this.webhookEvents.emit(organizationId, WebhookEventType.VALIDATION_SUBMITTED, {
      organization_id: organizationId,
      recording_id: recordingId,
      overall_score: dto.overallScore,
    });

    return validation;
  }

  /** Pending validations awaiting org-internal peer review, oldest first. */
  async listQueue(organizationId: string) {
    return this.prisma.subscriberValidation.findMany({
      where: { organizationId, status: ValidationReviewStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async approve(organizationId: string, reviewerUserId: string, validationId: string) {
    const validation = await this.getReviewable(organizationId, reviewerUserId, validationId);

    const updated = await this.prisma.subscriberValidation.update({
      where: { id: validationId },
      data: {
        status: ValidationReviewStatus.APPROVED,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    await this.prisma.validationAuditLog.create({
      data: {
        validationId,
        action: ValidationAuditAction.APPROVED,
        actorUserId: reviewerUserId,
      },
    });

    // Only now does the validation start influencing ISVC -- publishing
    // isvc-jobs here (not on submit) is what makes "approve" the actual
    // gate, since isvc-scorer's org-consensus refresh only ever reads
    // APPROVED rows.
    try {
      await this.streams.publish(ISVC_STREAM, { recording_id: validation.recordingId });
    } catch (err) {
      this.logger.error(
        `Failed to publish isvc-jobs for recording=${validation.recordingId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return updated;
  }

  async reject(
    organizationId: string,
    reviewerUserId: string,
    validationId: string,
    dto: RejectValidationDto,
  ) {
    const wasApproved = await this.getReviewable(organizationId, reviewerUserId, validationId);

    const updated = await this.prisma.subscriberValidation.update({
      where: { id: validationId },
      data: {
        status: ValidationReviewStatus.REJECTED,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    await this.prisma.validationAuditLog.create({
      data: {
        validationId,
        action: ValidationAuditAction.REJECTED,
        actorUserId: reviewerUserId,
        reason: dto.reason,
      },
    });

    // A previously-approved validation being reverted to REJECTED must
    // also trigger recalculation -- otherwise ISVC keeps counting a score
    // the org itself just retracted.
    if (wasApproved.status === ValidationReviewStatus.APPROVED) {
      try {
        await this.streams.publish(ISVC_STREAM, { recording_id: wasApproved.recordingId });
      } catch (err) {
        this.logger.error(
          `Failed to publish isvc-jobs for recording=${wasApproved.recordingId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return updated;
  }

  private async getReviewable(organizationId: string, reviewerUserId: string, validationId: string) {
    const validation = await this.prisma.subscriberValidation.findUnique({
      where: { id: validationId },
    });
    if (!validation || validation.organizationId !== organizationId) {
      throw new NotFoundException('Validation not found');
    }
    if (validation.userId === reviewerUserId) {
      throw new ForbiddenException('You cannot review your own validation');
    }
    return validation;
  }

  async listMine(organizationId: string, recordingId?: string) {
    return this.prisma.subscriberValidation.findMany({
      where: { organizationId, ...(recordingId ? { recordingId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async getAuditLog(organizationId: string, validationId: string) {
    const validation = await this.prisma.subscriberValidation.findUnique({
      where: { id: validationId },
      select: { organizationId: true },
    });
    if (!validation || validation.organizationId !== organizationId) {
      throw new NotFoundException('Validation not found');
    }
    return this.prisma.validationAuditLog.findMany({
      where: { validationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOrgContribution(organizationId: string) {
    const [recordingsValidated, totalValidations] = await Promise.all([
      this.prisma.subscriberValidation.findMany({
        where: { organizationId, status: ValidationReviewStatus.APPROVED },
        distinct: ['recordingId'],
        select: { recordingId: true },
      }),
      this.prisma.subscriberValidation.count({
        where: { organizationId, status: ValidationReviewStatus.APPROVED },
      }),
    ]);
    return {
      recordingsValidated: recordingsValidated.length,
      totalValidations,
    };
  }
}
