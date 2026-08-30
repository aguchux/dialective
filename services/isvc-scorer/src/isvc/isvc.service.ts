import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IsvcConfidence, Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { RedisStreamsService, StreamMessage } from '../redis-streams/redis-streams.service';
import { computeAgreement, computeConfidence, countOutliers, mean, stdDev } from './aggregation.util';

const ISVC_STREAM = process.env.ISVC_STREAM ?? 'isvc-jobs';
const CONSUMER_GROUP = process.env.CONSUMER_GROUP ?? 'isvc-scorers';
const CONSUMER_NAME = process.env.HOSTNAME ?? 'isvc-scorer-1';

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
   * changed since the last run.
   */
  private async refreshOrgConsensus(recordingId: string): Promise<void> {
    const grouped = await this.prisma.subscriberValidation.groupBy({
      by: ['organizationId'],
      where: { recordingId },
      _avg: { overallScore: true },
      _count: { _all: true },
    });

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
  }
}
