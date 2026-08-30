import { Injectable, NotFoundException } from '@nestjs/common';
import { IsvcConfidence, Prisma, SubmissionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

const CONFIDENCE_RANK: Record<IsvcConfidence, number> = {
  EMERGING: 0,
  ESTABLISHED: 1,
  HIGH: 2,
  VERY_HIGH: 3,
};

/**
 * Read-only against WordRecording -- Voice Stream's catalogue is a search
 * surface over data the trainer platform already collected, not a new
 * dataset of its own. Only SETTLED recordings with audio still present
 * (audio-retention-job nulls audioBucket/audioKey and sets audioDeletedAt
 * when it purges) are ever eligible, so a purged or unpaid recording can
 * never surface here or be previewed/added to a deck.
 */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private eligibleWhere(params: {
    countryCode?: string;
    dialectTag?: string;
    subdialectTag?: string;
    minScore?: number;
    minAudioQuality?: number;
  }): Prisma.WordRecordingWhereInput {
    return {
      status: SubmissionStatus.SETTLED,
      audioBucket: { not: null },
      audioKey: { not: null },
      audioDeletedAt: null,
      ...(params.dialectTag ? { dialectTag: params.dialectTag } : {}),
      ...(params.countryCode || params.subdialectTag
        ? {
            dialectVariant: {
              ...(params.subdialectTag ? { tag: params.subdialectTag } : {}),
              ...(params.countryCode
                ? { dialect: { country: { code: params.countryCode } } }
                : {}),
            },
          }
        : {}),
      ...(params.minScore !== undefined ? { score: { gte: params.minScore } } : {}),
      ...(params.minAudioQuality !== undefined
        ? { qualityScore: { gte: params.minAudioQuality } }
        : {}),
    };
  }

  async search(params: {
    countryCode?: string;
    dialectTag?: string;
    minScore?: number;
    minIsvs?: number;
    minConfidence?: IsvcConfidence;
    page: number;
    pageSize: number;
  }) {
    const where = this.eligibleWhere(params);

    // IsvcCurrent/IsvcAggregation aren't a Prisma relation on WordRecording
    // (recordingId is a loose string reference, same rationale as
    // StreamDeckItem.recordingId) -- an ISVC filter narrows the eligible id
    // set with a first query, then the WordRecording query below is scoped
    // to that set, rather than a declarative join.
    if (params.minIsvs !== undefined || params.minConfidence) {
      const matchingIds = await this.matchingIsvcRecordingIds(
        params.minIsvs,
        params.minConfidence,
      );
      if (matchingIds.length === 0) {
        return { items: [], page: params.page, pageSize: params.pageSize, total: 0, totalPages: 1 };
      }
      where.id = { in: matchingIds };
    }

    const [total, items] = await Promise.all([
      this.prisma.wordRecording.count({ where }),
      this.prisma.wordRecording.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          dialectTag: true,
          durationMs: true,
          score: true,
          rawScore: true,
          compositeScore: true,
          noiseScore: true,
          qualityScore: true,
          livenessScore: true,
          createdAt: true,
          dialectVariant: {
            select: {
              tag: true,
              name: true,
              dialect: { select: { tag: true, name: true, country: { select: { code: true, name: true } } } },
            },
          },
        },
      }),
    ]);

    const isvcByRecordingId = await this.currentIsvcByRecordingId(items.map((item) => item.id));

    return {
      items: items.map((item) => {
        const isvc = isvcByRecordingId.get(item.id);
        return {
          recordingId: item.id,
          dialectTag: item.dialectTag,
          durationMs: item.durationMs,
          dlCanonicalScore: item.score,
          rawScore: item.rawScore,
          compositeScore: item.compositeScore,
          noiseScore: item.noiseScore,
          qualityScore: item.qualityScore,
          livenessScore: item.livenessScore,
          country: item.dialectVariant?.dialect.country ?? null,
          dialect: item.dialectVariant
            ? { tag: item.dialectVariant.dialect.tag, name: item.dialectVariant.dialect.name }
            : null,
          subdialect: item.dialectVariant
            ? { tag: item.dialectVariant.tag, name: item.dialectVariant.name }
            : null,
          createdAt: item.createdAt,
          isvs: isvc?.isvs ?? null,
          isvcConfidence: isvc?.confidence ?? null,
          isvcOrganizationCount: isvc?.organizationCount ?? null,
          isvcAgreement: isvc?.agreement ?? null,
        };
      }),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  private async matchingIsvcRecordingIds(
    minIsvs?: number,
    minConfidence?: IsvcConfidence,
    minOrganizationCount?: number,
  ): Promise<string[]> {
    const currents = await this.prisma.isvcCurrent.findMany({
      include: { aggregation: true },
    });
    const minRank = minConfidence ? CONFIDENCE_RANK[minConfidence] : undefined;
    return currents
      .filter((c) => {
        if (minIsvs !== undefined && Number(c.aggregation.isvs) < minIsvs) return false;
        if (minRank !== undefined && CONFIDENCE_RANK[c.aggregation.confidence] < minRank) {
          return false;
        }
        if (
          minOrganizationCount !== undefined &&
          c.aggregation.organizationCount < minOrganizationCount
        ) {
          return false;
        }
        return true;
      })
      .map((c) => c.recordingId);
  }

  /**
   * Smart Deck rule matching (doc section 9.3) -- returns the raw eligible
   * recordingId set for a rule, unpaginated (unlike search(), which returns
   * a paginated read-model shape for the dashboard UI). Used by
   * SmartDeckEvaluatorService to diff against current deck membership.
   */
  async matchingRecordingIdsForRule(rule: {
    countryCode?: string | null;
    dialectTag?: string | null;
    subdialectTag?: string | null;
    minScore?: number | null;
    minIsvs?: number | null;
    minConfidence?: IsvcConfidence | null;
    minOrganizationCount?: number | null;
    minAudioQuality?: number | null;
  }): Promise<string[]> {
    const where = this.eligibleWhere({
      countryCode: rule.countryCode ?? undefined,
      dialectTag: rule.dialectTag ?? undefined,
      subdialectTag: rule.subdialectTag ?? undefined,
      minScore: rule.minScore ?? undefined,
      minAudioQuality: rule.minAudioQuality ?? undefined,
    });

    const hasIsvcFilter =
      rule.minIsvs !== undefined && rule.minIsvs !== null ||
      Boolean(rule.minConfidence) ||
      (rule.minOrganizationCount !== undefined && rule.minOrganizationCount !== null);

    if (hasIsvcFilter) {
      const matchingIds = await this.matchingIsvcRecordingIds(
        rule.minIsvs ?? undefined,
        rule.minConfidence ?? undefined,
        rule.minOrganizationCount ?? undefined,
      );
      if (matchingIds.length === 0) return [];
      where.id = { in: matchingIds };
    }

    const recordings = await this.prisma.wordRecording.findMany({
      where,
      select: { id: true },
    });
    return recordings.map((r) => r.id);
  }

  private async currentIsvcByRecordingId(recordingIds: string[]) {
    if (recordingIds.length === 0) return new Map();
    const currents = await this.prisma.isvcCurrent.findMany({
      where: { recordingId: { in: recordingIds } },
      include: { aggregation: true },
    });
    return new Map(
      currents.map((c) => [
        c.recordingId,
        {
          isvs: c.aggregation.isvs,
          confidence: c.aggregation.confidence,
          organizationCount: c.aggregation.organizationCount,
          agreement: c.aggregation.agreement,
        },
      ]),
    );
  }

  async preview(
    organizationId: string,
    userId: string,
    recordingId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const recording = await this.prisma.wordRecording.findFirst({
      where: { id: recordingId, ...this.eligibleWhere({}) },
      select: { audioBucket: true, audioKey: true },
    });
    if (!recording?.audioBucket || !recording.audioKey) {
      throw new NotFoundException('Recording not found or not available for preview');
    }

    await this.prisma.cataloguePreviewLog.create({
      data: { organizationId, userId, recordingId },
    });

    return this.storage.createPresignedDownloadUrl(recording.audioBucket, recording.audioKey);
  }

  /** Used by StreamDecksService to validate a recordingId before adding it to a deck. */
  async isEligible(recordingId: string): Promise<boolean> {
    const count = await this.prisma.wordRecording.count({
      where: { id: recordingId, ...this.eligibleWhere({}) },
    });
    return count > 0;
  }

  /**
   * Fetches the fields Voice Stream Phase 3's manifest/metadata/audio
   * endpoints need, already scoped to eligibleWhere() -- returns null for a
   * purged/unpaid/unknown recording, same "silently absent, never a
   * dangling reference" posture as isEligible.
   */
  async getEligibleRecording(recordingId: string) {
    return this.prisma.wordRecording.findFirst({
      where: { id: recordingId, ...this.eligibleWhere({}) },
      select: {
        id: true,
        dialectTag: true,
        durationMs: true,
        compositeScore: true,
        audioBucket: true,
        audioKey: true,
        dialectVariant: {
          select: {
            tag: true,
            dialect: { select: { tag: true, country: { select: { code: true } } } },
          },
        },
      },
    });
  }
}
