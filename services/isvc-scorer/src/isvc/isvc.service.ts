import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IsvcConfidence, Prisma, ValidationReviewStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { RedisStreamsService, StreamMessage } from '../redis-streams/redis-streams.service';
import { computeAgreement, computeConfidence, countOutliers, mean, stdDev } from './aggregation.util';

const ISVC_STREAM = process.env.ISVC_STREAM ?? 'isvc-jobs';
const CONSUMER_GROUP = process.env.CONSUMER_GROUP ?? 'isvc-scorers';
const CONSUMER_NAME = process.env.HOSTNAME ?? 'isvc-scorer-1';
const SMART_DECK_STREAM = process.env.SMART_DECK_STREAM ?? 'smart-deck-jobs';
const WEBHOOK_STREAM = process.env.WEBHOOK_STREAM ?? 'webhook-deliveries';

/**
 * Consumes isvc-jobs (published by api's IsvpService after every
 * validation submission) and recalculates the ISVC consensus for one
 * recording. Org-normalizes first (OrganizationValidationConsensus: one
 * score per org, regardless of how many of that org's validators
 * contributed -- product plan section 18), then aggregates across orgs
 * into a new, versioned IsvcAggregation only when the result materially
 * changed (product plan section 21).
 */
@Injectable()
export class IsvcService implements OnModuleInit {
  private readonly logger = new Logger(IsvcService.name);

  constructor(
    private readonly streams: RedisStreamsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.streams
      .consume(ISVC_STREAM, CONSUMER_GROUP, CONSUMER_NAME, (msg) => this.handle(msg))
      .catch((err) => this.logger.error(`Consumer loop crashed: ${err.message}`));
  }

  private async handle(message: StreamMessage): Promise<void> {
    const { recording_id: recordingId } = message.data;
    if (!recordingId) {
      this.logger.warn(`Received isvc job with no recording_id: ${JSON.stringify(message.data)}`);
      return;
    }
    this.logger.log(`Recalculating ISVC for recording=${recordingId}`);
    await this.recalculate(recordingId);
  }

  async recalculate(recordingId: string): Promise<void> {
    await this.refreshOrgConsensus(recordingId);

    const orgConsensus = await this.prisma.organizationValidationConsensus.findMany({
      where: { recordingId },
      select: { meanScore: true },
    });

    if (orgConsensus.length === 0) {
      this.logger.log(`No organization consensus for recording=${recordingId}; nothing to aggregate`);
      return;
    }

    const orgScores = orgConsensus.map((c) => Number(c.meanScore));
    const isvs = mean(orgScores);
    const clusterStdDev = stdDev(orgScores, isvs);
    const agreement = computeAgreement(orgScores, isvs);
    const organizationCount = orgScores.length;
    const outlierOrgCount = countOutliers(orgScores, isvs, clusterStdDev);
    const confidence = computeConfidence(organizationCount, agreement);

    await this.writeNewVersionIfMaterial(recordingId, {
      isvs,
      agreement,
      confidence,
      organizationCount,
      outlierOrgCount,
    });
  }

  /**
   * Recomputes every org's normalized score for this recording from raw
   * SubscriberValidation rows -- cheap (a handful of rows per org per
   * recording), and simpler than diffing which org's validators actually
   * changed since the last run. Only APPROVED rows count -- PENDING
   * validations haven't cleared org-internal peer review yet, and
   * REJECTED ones were explicitly retracted by the org (Phase 2 approve/
   * reject workflow, docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md
   * section 59).
   */
  private async refreshOrgConsensus(recordingId: string): Promise<void> {
    const grouped = await this.prisma.subscriberValidation.groupBy({
      by: ['organizationId'],
      where: { recordingId, status: ValidationReviewStatus.APPROVED },
      _avg: { overallScore: true },
      _count: { _all: true },
    });

    const groupedOrgIds = new Set(grouped.map((g) => g.organizationId));

    // An org that had a consensus row from a now-rejected/resubmitted
    // validation but no longer has ANY approved validation for this
    // recording must have its stale consensus row removed -- otherwise
    // it keeps contributing a now-nonexistent score to ISVC forever.
    await this.prisma.organizationValidationConsensus.deleteMany({
      where: { recordingId, organizationId: { notIn: [...groupedOrgIds] } },
    });

    if (grouped.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      grouped.map((g) =>
        this.prisma.organizationValidationConsensus.upsert({
          where: { organizationId_recordingId: { organizationId: g.organizationId, recordingId } },
          update: {
            validatorCount: g._count._all,
            meanScore: new Prisma.Decimal((g._avg.overallScore ?? 0).toFixed(2)),
          },
          create: {
            organizationId: g.organizationId,
            recordingId,
            validatorCount: g._count._all,
            meanScore: new Prisma.Decimal((g._avg.overallScore ?? 0).toFixed(2)),
          },
        }),
      ),
    );
  }

  private async writeNewVersionIfMaterial(
    recordingId: string,
    next: {
      isvs: number;
      agreement: number;
      confidence: IsvcConfidence;
      organizationCount: number;
      outlierOrgCount: number;
    },
  ): Promise<void> {
    const current = await this.prisma.isvcCurrent.findUnique({
      where: { recordingId },
      include: { aggregation: true },
    });

    if (
      current &&
      Number(current.aggregation.isvs).toFixed(2) === next.isvs.toFixed(2) &&
      Number(current.aggregation.agreement).toFixed(2) === next.agreement.toFixed(2) &&
      current.aggregation.confidence === next.confidence &&
      current.aggregation.organizationCount === next.organizationCount &&
      current.aggregation.outlierOrgCount === next.outlierOrgCount
    ) {
      this.logger.log(`ISVC for recording=${recordingId} unchanged; skipping new version`);
      return;
    }

    const nextVersion = (current?.aggregation.version ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      const aggregation = await tx.isvcAggregation.create({
        data: {
          recordingId,
          version: nextVersion,
          isvs: new Prisma.Decimal(next.isvs.toFixed(2)),
          agreement: new Prisma.Decimal(next.agreement.toFixed(2)),
          confidence: next.confidence,
          organizationCount: next.organizationCount,
          outlierOrgCount: next.outlierOrgCount,
        },
      });
      await tx.isvcCurrent.upsert({
        where: { recordingId },
        update: { aggregationId: aggregation.id },
        create: { recordingId, aggregationId: aggregation.id },
      });
    });

    this.logger.log(
      `Recording=${recordingId} ISVC v${nextVersion}: isvs=${next.isvs.toFixed(2)} agreement=${next.agreement.toFixed(2)} confidence=${next.confidence} orgs=${next.organizationCount} outliers=${next.outlierOrgCount}`,
    );

    // Best-effort, cross-service producer (mirrors api's IsvpService.submit
    // pattern) -- api's in-process Smart Deck evaluator consumes this to
    // re-evaluate any Smart Deck rule filtering on minIsvs/minConfidence/
    // minOrganizationCount for this recording. A publish failure must never
    // fail the ISVC write itself, which is already durable in Postgres.
    try {
      await this.streams.publish(SMART_DECK_STREAM, {
        trigger: 'isvc_changed',
        recording_id: recordingId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to publish smart-deck-jobs for recording=${recordingId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    // ISVC is cross-org by design (it's the consensus across every
    // organization that validated this recording), so a version change is
    // notified to every one of those orgs individually -- a
    // WebhookSubscription always belongs to exactly one organization, api's
    // WebhookEventService.emit shape isn't reachable from here (separate
    // deployable), so this publishes directly to webhook-deliveries the
    // same way it already does for smart-deck-jobs above.
    const consensusOrgs = await this.prisma.organizationValidationConsensus.findMany({
      where: { recordingId },
      select: { organizationId: true },
    });
    for (const { organizationId } of consensusOrgs) {
      try {
        await this.streams.publish(WEBHOOK_STREAM, {
          organization_id: organizationId,
          event_type: 'ISVC_VERSION_CREATED',
          payload: JSON.stringify({
            organization_id: organizationId,
            recording_id: recordingId,
            version: nextVersion,
            isvs: next.isvs,
            confidence: next.confidence,
          }),
          attempt: '1',
        });
      } catch (err) {
        this.logger.error(
          `Failed to publish webhook-deliveries for org=${organizationId} recording=${recordingId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
