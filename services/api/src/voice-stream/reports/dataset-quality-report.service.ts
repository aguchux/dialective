import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService, QualityTier, qualityTierFor } from '../catalogue/catalogue.service';

export interface DatasetQualityReport {
  totalEligibleRecordings: number;
  tierCounts: Record<QualityTier, number>;
  confidenceCounts: Record<string, number>;
  meanIsvs: number | null;
  meanAgreement: number | null;
  rows: Record<string, unknown>[];
}

/** Doc section 62's "dataset quality reports" -- a point-in-time summary of the eligible catalogue's ISVC quality, not scoped to any one deck. Reuses CatalogueService.eligibleWhere()'s eligibility rules rather than duplicating them. */
@Injectable()
export class DatasetQualityReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
  ) {}

  async build(): Promise<DatasetQualityReport> {
    const eligibleIds = await this.catalogue.matchingRecordingIdsForRule({});
    if (eligibleIds.length === 0) {
      return {
        totalEligibleRecordings: 0,
        tierCounts: { standard: 0, high: 0, premium_verified: 0 },
        confidenceCounts: {},
        meanIsvs: null,
        meanAgreement: null,
        rows: [],
      };
    }

    const currents = await this.prisma.isvcCurrent.findMany({
      where: { recordingId: { in: eligibleIds } },
      include: { aggregation: true },
    });
    const currentByRecordingId = new Map(currents.map((c) => [c.recordingId, c.aggregation]));

    const tierCounts: Record<QualityTier, number> = { standard: 0, high: 0, premium_verified: 0 };
    const confidenceCounts: Record<string, number> = {};
    let isvsSum = 0;
    let agreementSum = 0;
    let scoredCount = 0;
    const rows: Record<string, unknown>[] = [];

    for (const recordingId of eligibleIds) {
      const agg = currentByRecordingId.get(recordingId);
      const tier = qualityTierFor(agg?.confidence ?? null, agg?.organizationCount ?? null);
      tierCounts[tier]++;
      const confidenceLabel = agg?.confidence ?? 'NONE';
      confidenceCounts[confidenceLabel] = (confidenceCounts[confidenceLabel] ?? 0) + 1;
      if (agg) {
        isvsSum += Number(agg.isvs);
        agreementSum += Number(agg.agreement);
        scoredCount++;
      }
      rows.push({
        recordingId,
        qualityTier: tier,
        confidence: confidenceLabel,
        isvs: agg ? Number(agg.isvs) : null,
        agreement: agg ? Number(agg.agreement) : null,
        organizationCount: agg?.organizationCount ?? 0,
      });
    }

    return {
      totalEligibleRecordings: eligibleIds.length,
      tierCounts,
      confidenceCounts,
      meanIsvs: scoredCount > 0 ? Number((isvsSum / scoredCount).toFixed(2)) : null,
      meanAgreement: scoredCount > 0 ? Number((agreementSum / scoredCount).toFixed(2)) : null,
      rows,
    };
  }
}
