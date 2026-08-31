import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ValidationContributionReport {
  totalRecordingsValidated: number;
  averageValidatorCount: number | null;
  averageMeanScore: number | null;
  byDialect: Record<string, number>;
  rows: Record<string, unknown>[];
}

/**
 * Doc section 62's "validation contribution reports" -- an org's ISVP
 * footprint, sourced from OrganizationValidationConsensus (written by
 * isvc-scorer's refreshOrgConsensus per Phase 4b's cross-service wiring).
 * No prior aggregation exists over this table; this is the first.
 */
@Injectable()
export class ValidationContributionReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string): Promise<ValidationContributionReport> {
    const consensusRows = await this.prisma.organizationValidationConsensus.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });

    if (consensusRows.length === 0) {
      return {
        totalRecordingsValidated: 0,
        averageValidatorCount: null,
        averageMeanScore: null,
        byDialect: {},
        rows: [],
      };
    }

    const recordings = await this.prisma.wordRecording.findMany({
      where: { id: { in: consensusRows.map((r) => r.recordingId) } },
      select: { id: true, dialectTag: true },
    });
    const dialectByRecordingId = new Map(recordings.map((r) => [r.id, r.dialectTag]));

    const byDialect: Record<string, number> = {};
    let validatorCountSum = 0;
    let meanScoreSum = 0;

    for (const row of consensusRows) {
      const dialect = dialectByRecordingId.get(row.recordingId) ?? 'unknown';
      byDialect[dialect] = (byDialect[dialect] ?? 0) + 1;
      validatorCountSum += row.validatorCount;
      meanScoreSum += Number(row.meanScore);
    }

    return {
      totalRecordingsValidated: consensusRows.length,
      averageValidatorCount: Number((validatorCountSum / consensusRows.length).toFixed(2)),
      averageMeanScore: Number((meanScoreSum / consensusRows.length).toFixed(2)),
      byDialect,
      rows: consensusRows.map((row) => ({
        recordingId: row.recordingId,
        dialectTag: dialectByRecordingId.get(row.recordingId) ?? 'unknown',
        validatorCount: row.validatorCount,
        meanScore: Number(row.meanScore),
        updatedAt: row.updatedAt,
      })),
    };
  }
}
