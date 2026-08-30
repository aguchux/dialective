import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamsService } from '../../redis-streams/redis-streams.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { WebhookEventService } from '../webhooks/webhook-event.service';

const ISVC_STREAM = process.env.ISVC_STREAM ?? 'isvc-jobs';

/**
 * Independent Subscriber Validation Programme (ISVP). A validation is
 * owned by (organizationId, userId, recordingId) -- resubmission by the
 * same validator overwrites rather than creating a second row, since ISVP
 * has no approval workflow (unlike trainer-side submissions): a
 * validator's own org owns the correction. Recalculation of the ISVC
 * consensus happens out-of-band in services/isvc-scorer, consuming the
 * isvc-jobs Redis stream this service publishes to -- keeps validation
 * submission fast and lets the aggregation formula evolve independently
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

    const validation = await this.prisma.subscriberValidation.upsert({
      where: {
        organizationId_userId_recordingId: { organizationId, userId, recordingId },
      },
      update: {
        transcriptAccuracy: dto.transcriptAccuracy,
        pronunciationAccuracy: dto.pronunciationAccuracy,
        dialectAuthenticity: dto.dialectAuthenticity,
        speechClarity: dto.speechClarity,
        audioQuality: dto.audioQuality,
        overallScore: dto.overallScore,
        notes: dto.notes ?? null,
      },
      create: {
        organizationId,
        userId,
        recordingId,
        transcriptAccuracy: dto.transcriptAccuracy,
        pronunciationAccuracy: dto.pronunciationAccuracy,
        dialectAuthenticity: dto.dialectAuthenticity,
        speechClarity: dto.speechClarity,
        audioQuality: dto.audioQuality,
        overallScore: dto.overallScore,
        notes: dto.notes ?? null,
      },
    });

    // Best-effort: a publish failure must never fail the validation save --
    // the submission itself is already durable in Postgres; recalculation
    // can be triggered again later (e.g. a manual replay) without data loss.
    try {
      await this.streams.publish(ISVC_STREAM, { recording_id: recordingId });
    } catch (err) {
      this.logger.error(
        `Failed to publish isvc-jobs for recording=${recordingId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    void this.webhookEvents.emit(organizationId, WebhookEventType.VALIDATION_SUBMITTED, {
      organization_id: organizationId,
      recording_id: recordingId,
      overall_score: dto.overallScore,
    });

    return validation;
  }

  async listMine(organizationId: string, recordingId?: string) {
    return this.prisma.subscriberValidation.findMany({
      where: { organizationId, ...(recordingId ? { recordingId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async getOrgContribution(organizationId: string) {
    const [recordingsValidated, totalValidations] = await Promise.all([
      this.prisma.subscriberValidation.findMany({
        where: { organizationId },
        distinct: ['recordingId'],
        select: { recordingId: true },
      }),
      this.prisma.subscriberValidation.count({ where: { organizationId } }),
    ]);
    return {
      recordingsValidated: recordingsValidated.length,
      totalValidations,
    };
  }
}
