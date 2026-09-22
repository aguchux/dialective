import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsvcConfidence, Prisma, SubmissionStatus, VdclPurpose } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { RightsService } from '../../vdcl/rights/rights.service';

const CONFIDENCE_RANK: Record<IsvcConfidence, number> = {
  EMERGING: 0,
  ESTABLISHED: 1,
  HIGH: 2,
  VERY_HIGH: 3,
};

/** Doc section 62's "Premium Verified classification" threshold -- tunable, not load-bearing elsewhere. */
const PREMIUM_VERIFIED_MIN_ORG_COUNT = 3;

export type QualityTier = 'standard' | 'high' | 'premium_verified';

export function qualityTierFor(
  confidence: IsvcConfidence | null,
  organizationCount: number | null,
): QualityTier {
  if (confidence === 'VERY_HIGH' && (organizationCount ?? 0) >= PREMIUM_VERIFIED_MIN_ORG_COUNT) {
    return 'premium_verified';
  }
  if (confidence === 'HIGH') return 'high';
  return 'standard';
}

/** Takes the stricter (higher-ranked) of two optional confidence floors. */
function stricterConfidence(a?: IsvcConfidence, b?: IsvcConfidence): IsvcConfidence | undefined {
  if (!a) return b;
  if (!b) return a;
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

const RECORDING_SELECT = {
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
      dialect: {
        select: { tag: true, name: true, country: { select: { code: true, name: true } } },
      },
    },
  },
} satisfies Prisma.WordRecordingSelect;

type SearchRecordingRow = Prisma.WordRecordingGetPayload<{ select: typeof RECORDING_SELECT }>;
type CurrentIsvc = {
  isvs: unknown;
  confidence: IsvcConfidence;
  organizationCount: number;
  agreement: unknown;
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
    private readonly rights: RightsService,
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
              ...(params.countryCode ? { dialect: { country: { code: params.countryCode } } } : {}),
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
    /** Phase 5 tier gating -- the caller's plan floor, ANDed with minConfidence (stricter wins). Never surfaced as a user-facing filter value, just narrows results. */
    planMinConfidence?: IsvcConfidence;
    sortBy?: 'newest' | 'isvs_desc';
    page: number;
    pageSize: number;
  }) {
    const where = this.eligibleWhere(params);
    const effectiveMinConfidence = stricterConfidence(
      params.minConfidence,
      params.planMinConfidence,
    );

    // IsvcCurrent/IsvcAggregation aren't a Prisma relation on WordRecording
    // (recordingId is a loose string reference, same rationale as
    // StreamDeckItem.recordingId) -- an ISVC filter narrows the eligible id
    // set with a first query, then the WordRecording query below is scoped
    // to that set, rather than a declarative join.
    const needsIsvcFilter = params.minIsvs !== undefined || Boolean(effectiveMinConfidence);
    const needsIsvcSort = params.sortBy === 'isvs_desc';

    if (needsIsvcFilter || needsIsvcSort) {
      const matching = await this.matchingIsvcRecordingsWithScore(
        params.minIsvs,
        effectiveMinConfidence,
      );
      if (matching.length === 0) {
        return { items: [], page: params.page, pageSize: params.pageSize, total: 0, totalPages: 1 };
      }
      where.id = { in: matching.map((m) => m.recordingId) };

      if (needsIsvcSort) {
        return this.searchSortedByIsvs(where, matching, params.page, params.pageSize);
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.wordRecording.count({ where }),
      this.prisma.wordRecording.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: RECORDING_SELECT,
      }),
    ]);

    const isvcByRecordingId = await this.currentIsvcByRecordingId(items.map((item) => item.id));

    return {
      items: items.map((item) => this.toSearchResult(item, isvcByRecordingId.get(item.id))),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  /**
   * ISVS isn't known before pagination in the normal flow (it's fetched for
   * just the current page, after WordRecording is already paginated), so
   * sort-by-ISVS instead resolves the full matching id set with scores
   * up-front, sorts in memory, and slices the page window from that
   * ordered array before doing a single scoped WordRecording lookup.
   */
  private async searchSortedByIsvs(
    where: Prisma.WordRecordingWhereInput,
    matching: { recordingId: string; isvs: number }[],
    page: number,
    pageSize: number,
  ) {
    const sorted = [...matching].sort((a, b) => b.isvs - a.isvs);
    const total = sorted.length;
    const pageIds = sorted
      .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
      .map((m) => m.recordingId);

    if (pageIds.length === 0) {
      return {
        items: [],
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    const rows = await this.prisma.wordRecording.findMany({
      where: { ...where, id: { in: pageIds } },
      select: RECORDING_SELECT,
    });
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const orderedRows = pageIds
      .map((id) => rowById.get(id))
      .filter((r): r is SearchRecordingRow => Boolean(r));
    const isvcByRecordingId = await this.currentIsvcByRecordingId(
      orderedRows.map((item) => item.id),
    );

    return {
      items: orderedRows.map((item) => this.toSearchResult(item, isvcByRecordingId.get(item.id))),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private toSearchResult(item: SearchRecordingRow, isvc: CurrentIsvc | undefined) {
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
      qualityTier: qualityTierFor(isvc?.confidence ?? null, isvc?.organizationCount ?? null),
    };
  }

  private async matchingIsvcCurrents(
    minIsvs?: number,
    minConfidence?: IsvcConfidence,
    minOrganizationCount?: number,
  ) {
    const currents = await this.prisma.isvcCurrent.findMany({
      include: { aggregation: true },
    });
    const minRank = minConfidence ? CONFIDENCE_RANK[minConfidence] : undefined;
    return currents.filter((c) => {
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
    });
  }

  private async matchingIsvcRecordingIds(
    minIsvs?: number,
    minConfidence?: IsvcConfidence,
    minOrganizationCount?: number,
  ): Promise<string[]> {
    const currents = await this.matchingIsvcCurrents(minIsvs, minConfidence, minOrganizationCount);
    return currents.map((c) => c.recordingId);
  }

  /** Same filter as matchingIsvcRecordingIds, but also returns each match's ISVS so callers can sort by it without a second round-trip (used by sortBy=isvs_desc). */
  private async matchingIsvcRecordingsWithScore(
    minIsvs?: number,
    minConfidence?: IsvcConfidence,
    minOrganizationCount?: number,
  ): Promise<{ recordingId: string; isvs: number }[]> {
    const currents = await this.matchingIsvcCurrents(minIsvs, minConfidence, minOrganizationCount);
    return currents.map((c) => ({ recordingId: c.recordingId, isvs: Number(c.aggregation.isvs) }));
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
      (rule.minIsvs !== undefined && rule.minIsvs !== null) ||
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
    planMinConfidence?: IsvcConfidence,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const recording = await this.prisma.wordRecording.findFirst({
      where: { id: recordingId, ...this.eligibleWhere({}) },
      select: { audioBucket: true, audioKey: true },
    });
    if (!recording?.audioBucket || !recording.audioKey) {
      throw new NotFoundException('Recording not found or not available for preview');
    }
    if (planMinConfidence && !(await this.meetsConfidenceFloor(recordingId, planMinConfidence))) {
      throw new NotFoundException('Recording not found or not available for preview');
    }

    // VDCL commercial lock. This route is the SECOND way audio leaves for a
    // subscriber: it hands out a presigned Spaces URL directly, bypassing the
    // stream API's guard chain, byte metering and StreamAccessLog entirely.
    // A rights check wired only into the streaming chokepoint would therefore
    // be trivially sidesteppable, so it has to be enforced here too.
    const decision = await this.rights.mayUse(recordingId, VdclPurpose.ASR_TRAINING);
    if (!decision.allowed) {
      void this.rights.recordDecision({
        recordingId,
        purpose: VdclPurpose.ASR_TRAINING,
        decision,
        actorId: userId,
        detail: `catalogue_preview org=${organizationId}`,
      });
      throw new ForbiddenException(
        'This recording is not licensed for preview under an active contributor licence',
      );
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
  async getEligibleRecording(recordingId: string, planMinConfidence?: IsvcConfidence) {
    const recording = await this.prisma.wordRecording.findFirst({
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
    if (!recording) return null;
    if (planMinConfidence && !(await this.meetsConfidenceFloor(recordingId, planMinConfidence))) {
      return null;
    }
    return recording;
  }

  /** True when recordingId's current ISVC confidence meets or exceeds floor. A recording with no ISVC yet never meets a floor (EMERGING/no-data isn't a confidence level a paid tier floor can satisfy). */
  private async meetsConfidenceFloor(recordingId: string, floor: IsvcConfidence): Promise<boolean> {
    const current = await this.prisma.isvcCurrent.findUnique({
      where: { recordingId },
      include: { aggregation: true },
    });
    if (!current) return false;
    return CONFIDENCE_RANK[current.aggregation.confidence] >= CONFIDENCE_RANK[floor];
  }
}
