import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  IsvcConfidence,
  Prisma,
  StreamRecordKind,
  SubmissionStatus,
  VdclPurpose,
} from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { RightsService } from '../../vdcl/rights/rights.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

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
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Narrows the catalogue to recordings a contributor has actually licensed.
   *
   * Without this, search lists every SETTLED recording and the licence is
   * only checked when audio is requested -- so a subscriber sees rows they
   * can never play, including work from contributors who signed nothing. The
   * listing and the audio gate should agree.
   *
   * On its own flag (vdclCatalogueCoverageFilterEnabled), NOT the
   * vdclEnforcementEnabled one the audio checks use -- that flag is already
   * true in production, where it means "a request for uncovered audio is
   * denied" and the catalogue stays whole. Removing rows from the listing is
   * a much larger blast radius on the same signal: with 191,800 settled
   * recordings and 42 covered by a manifest, reusing that flag would have
   * emptied the catalogue the moment this shipped. Default off.
   *
   * Membership is tested against the manifest, not the licence status. The
   * status question -- withdrawn, suspended, purpose not granted -- stays with
   * RightsService at the audio boundary, where it is evaluated live so a
   * withdrawal takes effect immediately. A withdrawn contributor's rows may
   * therefore still appear in search; the audio behind them is refused. That
   * is the intended split: revoking a licence removes PERMISSION, it does not
   * remove the recordings from Stream.
   */
  private async vdclCoverageWhere(
    recordKind: StreamRecordKind = StreamRecordKind.WORD_RECORDING,
  ): Promise<{ id?: { in: string[] } }> {
    if (!(await this.settings.isVdclCatalogueCoverageFilterEnabled())) return {};
    return {
      // Correlated existence check rather than a fetched id list: the
      // manifest-item table grows with every signed licence, and pulling
      // every covered recordingId into memory to build an `in` clause would
      // not survive scale.
      id: {
        in: await this.coveredRecordingIds(recordKind),
      },
    };
  }

  /**
   * Recording ids covered by any VDCL manifest.
   *
   * VdclManifestItem.recordingId is a loose string, not a Prisma relation on
   * WordRecording (same rationale as StreamDeckItem.recordingId), so this
   * cannot be expressed as a nested `where` and has to resolve the id set
   * first -- the same two-step the ISVC filters in `search` already use.
   */
  private async coveredRecordingIds(recordKind: StreamRecordKind): Promise<string[]> {
    // Scoped BY KIND, not pooled across both. The two record tables have
    // independent uuid spaces, so a pooled id set would let a licensed domain
    // conversation vouch for an unlicensed word recording that happened to
    // share its id -- a coverage filter answering about the wrong dataset.
    const rows = await this.prisma.vdclManifestItem.findMany({
      where: { recordKind },
      select: { recordingId: true },
      distinct: ['recordingId'],
    });
    return rows.map((row) => row.recordingId);
  }

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

    // Composed under AND rather than merged into `where.id`, because the ISVC
    // branch below assigns `where.id` outright -- a second id filter written
    // the same way would silently replace this one and widen the result set
    // back to unlicensed recordings.
    const coverage = await this.vdclCoverageWhere();
    if (coverage.id !== undefined) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), coverage];
    }

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

    // Coverage applies to rule matching too, or a Smart Deck would quietly
    // auto-populate itself with unlicensed recordings -- the same leak as
    // search(), arriving by a different door and without anyone browsing.
    // Composed under AND for the same reason as in search(): the ISVC branch
    // below assigns where.id outright.
    const coverage = await this.vdclCoverageWhere();
    if (coverage.id !== undefined) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), coverage];
    }

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
    recordKind: StreamRecordKind = StreamRecordKind.WORD_RECORDING,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    // The coverage filter applies here too, so a recording outside every
    // manifest 404s rather than reaching the rights check below and
    // returning a 403 that implies the clip exists and is merely unlicensed.
    const coverage = await this.vdclCoverageWhere(recordKind);
    const recording =
      recordKind === StreamRecordKind.WORD_RECORDING
        ? await this.prisma.wordRecording.findFirst({
            where: { id: recordingId, ...this.eligibleWhere({}), ...coverage },
            select: { audioBucket: true, audioKey: true },
          })
        : await this.prisma.domainConversationRecording.findFirst({
            where: { id: recordingId, ...this.domainEligibleWhere(), ...coverage },
            select: { audioBucket: true, audioKey: true },
          });
    if (!recording?.audioBucket || !recording.audioKey) {
      throw new NotFoundException('Recording not found or not available for preview');
    }
    // Word-only, for the reason given in getEligibleRecording: no domain
    // conversation will ever have an ISVC aggregation to meet a floor with.
    if (
      recordKind === StreamRecordKind.WORD_RECORDING &&
      planMinConfidence &&
      !(await this.meetsConfidenceFloor(recordingId, planMinConfidence))
    ) {
      throw new NotFoundException('Recording not found or not available for preview');
    }

    // VDCL commercial lock. This route is the SECOND way audio leaves for a
    // subscriber: it hands out a presigned Spaces URL directly, bypassing the
    // stream API's guard chain, byte metering and StreamAccessLog entirely.
    // A rights check wired only into the streaming chokepoint would therefore
    // be trivially sidesteppable, so it has to be enforced here too.
    //
    // Unlike the stream API, this is a HUMAN dashboard session with no
    // machine credential, so there is no declared purpose to match against.
    // Preview is evaluation -- a person listening to decide whether to
    // license -- which is why it checks LINGUISTIC_RESEARCH, the narrowest
    // purpose in the enum, rather than a training purpose the contributor
    // may well have refused. A contributor who grants nothing at all still
    // has their clip withheld from preview.
    const decision = await this.rights.mayUse(
      { recordKind, recordingId },
      VdclPurpose.LINGUISTIC_RESEARCH,
    );
    if (!decision.allowed) {
      void this.rights.recordDecision({
        recordingId,
        purpose: VdclPurpose.LINGUISTIC_RESEARCH,
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

  /**
   * Used by StreamDecksService to validate a recordingId before adding it to
   * a deck.
   *
   * Coverage-filtered, so an unlicensed recording cannot be hand-added to a
   * deck even by an org that learned its id some other way. Without this the
   * search filter would only be a display convention.
   */
  async isEligible(
    recordKind: StreamRecordKind,
    recordingId: string,
  ): Promise<boolean> {
    // Resolved for the kind being asked about, once -- see
    // coveredRecordingIds on why a pooled id set would be wrong.
    const coverage = await this.vdclCoverageWhere(recordKind);

    // The eligibility predicate is the same for both kinds -- settled, audio
    // still present -- but it has to be applied to the right table. An
    // exhaustive switch rather than a table lookup, so adding a record kind
    // fails the build here instead of silently answering "not eligible" and
    // making a whole dataset unaddable to any deck.
    switch (recordKind) {
      case StreamRecordKind.WORD_RECORDING: {
        const count = await this.prisma.wordRecording.count({
          where: { id: recordingId, ...this.eligibleWhere({}), ...coverage },
        });
        return count > 0;
      }
      case StreamRecordKind.DOMAIN_CONVERSATION_RECORDING: {
        const count = await this.prisma.domainConversationRecording.count({
          where: { id: recordingId, ...this.domainEligibleWhere(), ...coverage },
        });
        return count > 0;
      }
    }
  }

  /**
   * The domain-conversation counterpart of eligibleWhere.
   *
   * Separate rather than generic: the two tables share these four column names
   * today, but a shared predicate typed against one of them would silently
   * stop applying if either diverged. The duplication is four lines and it
   * makes the divergence a compile error rather than a missing filter.
   */
  private domainEligibleWhere(): Prisma.DomainConversationRecordingWhereInput {
    return {
      status: SubmissionStatus.SETTLED,
      audioBucket: { not: null },
      audioKey: { not: null },
      audioDeletedAt: null,
    };
  }

  /**
   * Fetches the fields Voice Stream Phase 3's manifest/metadata/audio
   * endpoints need, already scoped to eligibleWhere() -- returns null for a
   * purged/unpaid/unknown recording, same "silently absent, never a
   * dangling reference" posture as isEligible.
   *
   * Deliberately NOT coverage-filtered, unlike search/isEligible above. Every
   * caller of this already runs the recording through RightsService, which is
   * the stronger check: it is status-aware, so a withdrawn or suspended
   * licence is refused live. Filtering here as well would turn an accurate
   * "not licensed for this purpose" denial into a bare 404 and duplicate
   * enforcement in a weaker, presence-only form.
   */
  async getEligibleRecording(
    recordKind: StreamRecordKind,
    recordingId: string,
    planMinConfidence?: IsvcConfidence,
  ) {
    const variantSelect = {
      select: {
        tag: true,
        dialect: { select: { tag: true, country: { select: { code: true } } } },
      },
    };

    const recording =
      recordKind === StreamRecordKind.WORD_RECORDING
        ? await this.prisma.wordRecording.findFirst({
            where: { id: recordingId, ...this.eligibleWhere({}) },
            select: {
              id: true,
              dialectTag: true,
              durationMs: true,
              compositeScore: true,
              audioBucket: true,
              audioKey: true,
              dialectVariant: variantSelect,
            },
          })
        : await this.prisma.domainConversationRecording.findFirst({
            where: { id: recordingId, ...this.domainEligibleWhere() },
            select: {
              id: true,
              dialectTag: true,
              durationMs: true,
              compositeScore: true,
              audioBucket: true,
              audioKey: true,
              dialectVariant: variantSelect,
            },
          });
    if (!recording) return null;

    // The ISVC confidence floor is a WORD_RECORDING concept: ISVC aggregates
    // subscriber validations, and no ISVP/ISVC path scores a domain
    // conversation, so none will ever have an aggregation. Applying the floor
    // to them would make every domain conversation invisible on any paid tier
    // that sets one -- excluded for failing a test that cannot be taken.
    //
    // Stated rather than silently skipped: a tier's confidence floor therefore
    // does NOT currently constrain domain conversations. If that becomes
    // wrong, the fix is to give them a quality signal of their own, not to
    // borrow one that means something else.
    if (
      recordKind === StreamRecordKind.WORD_RECORDING &&
      planMinConfidence &&
      !(await this.meetsConfidenceFloor(recordingId, planMinConfidence))
    ) {
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
