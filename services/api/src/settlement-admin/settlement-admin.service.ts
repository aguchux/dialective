import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, computeTrainingPayout, creditTrainingPayoutOps, mintTrainingPayoutOps } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { TokenomicsService } from '../tokenomics/tokenomics.service';
import { ListUnsettledDto } from './dto/list-unsettled.dto';

export type SettlementKind = 'word' | 'submission';

interface QualityWeights {
  consensus: number;
  noise: number;
  quality: number;
  liveness: number;
}

/**
 * Manual-settlement counterpart to services/settlement-job's automated
 * SettlementService. That service lives in a separate, non-HTTP deployable
 * (cron-invoked, no Nest module shared with api -- confirmed via its
 * package.json having no @nestjs/platform-express), so it isn't importable
 * here. The settle-one-row math and transaction shape below are
 * deliberately kept identical to settleSubmissions/settleWordRecordings
 * (same no-loss formula, same lock-release/credit/mint/status-update
 * transaction) so a row settled manually here is indistinguishable from one
 * settled by the cron job -- this exists purely to let an admin clear a row
 * the cron either hasn't reached yet or threw on (its loop is per-row
 * try/catch, not all-or-nothing, so a bad row is silently retried forever
 * without visibility -- this list is that visibility).
 */
@Injectable()
export class SettlementAdminService {
  private readonly logger = new Logger(SettlementAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly tokenomics: TokenomicsService,
  ) {}

  async listUnsettled(query: ListUnsettledDto) {
    const settlementDelayMinutes = await this.settings.getSettlementDelayMinutes();
    const dueBefore = new Date(Date.now() - settlementDelayMinutes * 60_000);

    const kinds: SettlementKind[] = query.kind ? [query.kind] : ['submission', 'word'];
    const [submissionRows, wordRows] = await Promise.all([
      kinds.includes('submission') ? this.fetchUnsettledSubmissions() : Promise.resolve([]),
      kinds.includes('word') ? this.fetchUnsettledWordRecordings() : Promise.resolve([]),
    ]);

    const merged = [
      ...submissionRows.map((row) => this.toSummary('submission', row, settlementDelayMinutes, dueBefore)),
      ...wordRows.map((row) => this.toSummary('word', row, settlementDelayMinutes, dueBefore)),
    ].sort((a, b) => a.scoredAt.localeCompare(b.scoredAt));

    const total = merged.length;
    const skip = (query.page - 1) * query.pageSize;
    const items = merged.slice(skip, skip + query.pageSize);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      stuckCount: merged.filter((row) => !row.pendingDelay).length,
    };
  }

  private fetchUnsettledSubmissions() {
    return this.prisma.submission.findMany({
      where: { status: 'SCORED', settledAt: null },
      orderBy: { scoredAt: 'asc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  private fetchUnsettledWordRecordings() {
    return this.prisma.wordRecording.findMany({
      where: { status: 'SCORED', settledAt: null, userId: { not: null } },
      orderBy: { scoredAt: 'asc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  private toSummary(
    kind: SettlementKind,
    row: {
      id: string;
      tokensSpent: Prisma.Decimal;
      score: Prisma.Decimal | null;
      scoredAt: Date | null;
      createdAt: Date;
      user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
    },
    settlementDelayMinutes: number,
    dueBefore: Date,
  ) {
    const scoredAt = row.scoredAt ?? row.createdAt;
    const pendingDelay = settlementDelayMinutes > 0 && scoredAt > dueBefore;
    return {
      id: row.id,
      kind,
      trainer: row.user,
      tokensSpent: row.tokensSpent.toString(),
      score: row.score?.toString() ?? null,
      scoredAt: scoredAt.toISOString(),
      pendingDelay,
      missingScore: row.score === null,
    };
  }

  /**
   * Settles one row (word or submission) using the exact same formula and
   * transaction shape as settlement-job's settleSubmissions/
   * settleWordRecordings -- see that service for the canonical version this
   * mirrors. `force` lets an admin settle a row still inside the delay
   * window (an explicit override of a soft guardrail, not a bug -- the
   * automated job simply hasn't picked it up yet).
   */
  async settleOne(kind: SettlementKind, id: string, force: boolean) {
    const [bonusCapMultiple, qualityGateEnabled, qualityWeights, asrMatchWeight, scoreRange, settlementDelayMinutes, mintingPaused] =
      await Promise.all([
        this.settings.getTrainingPayoutBonusCapMultiple(),
        this.settings.isQualityGateEnabled(),
        this.settings.getQualityWeights(),
        this.settings.getAsrMatchWeight(),
        this.settings.getScoreRange(),
        this.settings.getSettlementDelayMinutes(),
        this.tokenomics.isMintingPaused(),
      ]);

    if (kind === 'submission') {
      return this.settleSubmission(id, force, {
        bonusCapMultiple,
        qualityGateEnabled,
        qualityWeights,
        scoreRange,
        settlementDelayMinutes,
        mintingPaused,
      });
    }
    return this.settleWordRecording(id, force, {
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
    });
  }

  /**
   * Bulk variant of settleOne -- settles every currently-eligible row (same
   * per-row try/catch-and-continue behavior as settlement-job's own run, so
   * one bad row can't block the rest). `force` applies uniformly to every
   * row in scope.
   */
  async settleAll(kind: SettlementKind | undefined, force: boolean) {
    const settings = await Promise.all([
      this.settings.getTrainingPayoutBonusCapMultiple(),
      this.settings.isQualityGateEnabled(),
      this.settings.getQualityWeights(),
      this.settings.getAsrMatchWeight(),
      this.settings.getScoreRange(),
      this.settings.getSettlementDelayMinutes(),
      this.tokenomics.isMintingPaused(),
    ]);
    const [
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
    ] = settings;

    const kinds: SettlementKind[] = kind ? [kind] : ['submission', 'word'];
    let settledCount = 0;
    let failedCount = 0;
    let skippedDelayCount = 0;

    if (kinds.includes('submission')) {
      const rows = await this.fetchUnsettledSubmissions();
      for (const row of rows) {
        if (!force && this.isPendingDelay(row.scoredAt ?? row.createdAt, settlementDelayMinutes)) {
          skippedDelayCount += 1;
          continue;
        }
        try {
          await this.settleSubmission(row.id, force, {
            bonusCapMultiple,
            qualityGateEnabled,
            qualityWeights,
            scoreRange,
            settlementDelayMinutes,
            mintingPaused,
          });
          settledCount += 1;
        } catch (err) {
          failedCount += 1;
          this.logger.error(
            `Manual settle failed for submission=${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (kinds.includes('word')) {
      const rows = await this.fetchUnsettledWordRecordings();
      for (const row of rows) {
        if (!force && this.isPendingDelay(row.scoredAt ?? row.createdAt, settlementDelayMinutes)) {
          skippedDelayCount += 1;
          continue;
        }
        try {
          await this.settleWordRecording(row.id, force, {
            bonusCapMultiple,
            qualityGateEnabled,
            qualityWeights,
            asrMatchWeight,
            scoreRange,
            settlementDelayMinutes,
            mintingPaused,
          });
          settledCount += 1;
        } catch (err) {
          failedCount += 1;
          this.logger.error(
            `Manual settle failed for wordRecording=${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return { settledCount, failedCount, skippedDelayCount };
  }

  private isPendingDelay(scoredAt: Date, settlementDelayMinutes: number): boolean {
    return settlementDelayMinutes > 0 && scoredAt > new Date(Date.now() - settlementDelayMinutes * 60_000);
  }

  private async settleSubmission(
    id: string,
    force: boolean,
    ctx: {
      bonusCapMultiple: number;
      qualityGateEnabled: boolean;
      qualityWeights: QualityWeights;
      scoreRange: { min: number; max: number };
      settlementDelayMinutes: number;
      mintingPaused: boolean;
    },
  ) {
    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'SCORED' || submission.settledAt) {
      throw new UnprocessableEntityException('This submission is not currently eligible for settlement');
    }
    if (submission.score === null) {
      throw new UnprocessableEntityException('This submission has no score and cannot be settled');
    }
    if (!force && this.isPendingDelay(submission.scoredAt ?? submission.createdAt, ctx.settlementDelayMinutes)) {
      throw new UnprocessableEntityException(
        'This submission is still inside the settlement delay window -- pass force to settle it early',
      );
    }

    const realScore = submission.rawScore ?? submission.score;
    const compositeScore = computeCompositeScore(
      realScore,
      submission.noiseScore,
      submission.qualityScore,
      submission.livenessScore,
      ctx.qualityWeights,
      ctx.scoreRange,
    );
    const payoutScore = ctx.qualityGateEnabled ? compositeScore : submission.score;
    const payout = computeTrainingPayout(submission.tokensSpent, payoutScore, ctx.bonusCapMultiple);
    const { ops } = await creditTrainingPayoutOps(this.prisma, submission.userId, payout, submission.id);
    const mintOps = ctx.mintingPaused
      ? []
      : (await mintTrainingPayoutOps(this.prisma, submission.userId, payout, submission.id)).ops;
    const lockOps = (await this.wasLocked(submission.id))
      ? [
          this.prisma.wallet.updateMany({
            where: { userId: submission.userId },
            data: { lockedBalance: { decrement: submission.tokensSpent } },
          }),
        ]
      : [];

    await this.prisma.$transaction([
      ...lockOps,
      ...ops,
      ...mintOps,
      this.prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'SETTLED', compositeScore, payoutTokenAmount: payout, settledAt: new Date() },
      }),
    ]);

    this.logger.log(`Manually settled submission=${submission.id} payout=${payout.toString()}`);
    return { id: submission.id, payoutTokenAmount: payout.toString() };
  }

  private async settleWordRecording(
    id: string,
    force: boolean,
    ctx: {
      bonusCapMultiple: number;
      qualityGateEnabled: boolean;
      qualityWeights: QualityWeights;
      asrMatchWeight: number;
      scoreRange: { min: number; max: number };
      settlementDelayMinutes: number;
      mintingPaused: boolean;
    },
  ) {
    const recording = await this.prisma.wordRecording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundException('Word recording not found');
    if (recording.status !== 'SCORED' || recording.settledAt) {
      throw new UnprocessableEntityException('This word recording is not currently eligible for settlement');
    }
    if (recording.score === null || recording.userId === null) {
      throw new UnprocessableEntityException(
        'This word recording has no score or trainer and cannot be settled',
      );
    }
    if (!force && this.isPendingDelay(recording.scoredAt ?? recording.createdAt, ctx.settlementDelayMinutes)) {
      throw new UnprocessableEntityException(
        'This word recording is still inside the settlement delay window -- pass force to settle it early',
      );
    }

    const realScore = recording.rawScore ?? recording.score;
    const compositeScore = computeWordRecordingCompositeScore(
      realScore,
      recording.noiseScore,
      recording.qualityScore,
      recording.livenessScore,
      recording.asrMatchScore,
      { ...ctx.qualityWeights, asrMatch: ctx.asrMatchWeight },
      ctx.scoreRange,
    );
    const payoutScore = ctx.qualityGateEnabled ? compositeScore : recording.score;
    const payout = computeTrainingPayout(recording.tokensSpent, payoutScore, ctx.bonusCapMultiple);
    const { ops } = await creditTrainingPayoutOps(this.prisma, recording.userId, payout, recording.id);
    const mintOps = ctx.mintingPaused
      ? []
      : (await mintTrainingPayoutOps(this.prisma, recording.userId, payout, recording.id)).ops;
    const lockOps = (await this.wasLocked(recording.id))
      ? [
          this.prisma.wallet.updateMany({
            where: { userId: recording.userId },
            data: { lockedBalance: { decrement: recording.tokensSpent } },
          }),
        ]
      : [];

    await this.prisma.$transaction([
      ...lockOps,
      ...ops,
      ...mintOps,
      this.prisma.wordRecording.update({
        where: { id: recording.id },
        data: { status: 'SETTLED', compositeScore, payoutTokenAmount: payout, settledAt: new Date() },
      }),
    ]);

    this.logger.log(`Manually settled wordRecording=${recording.id} payout=${payout.toString()}`);
    return { id: recording.id, payoutTokenAmount: payout.toString() };
  }

  private async wasLocked(reference: string): Promise<boolean> {
    const lock = await this.prisma.ledgerEntry.findFirst({
      where: { reference, type: 'TASK_LOCK' },
      select: { id: true },
    });
    return lock !== null;
  }
}

/** Duplicated from services/settlement-job/src/settlement.service.ts -- see this file's own doc comment for why. */
function computeCompositeScore(
  realScore: Prisma.Decimal,
  noiseScore: Prisma.Decimal | null,
  qualityScore: Prisma.Decimal | null,
  livenessScore: Prisma.Decimal | null,
  weights: QualityWeights,
  scoreRange: { min: number; max: number },
): number {
  const weightSum = weights.consensus + weights.noise + weights.quality + weights.liveness;
  const blended =
    weightSum <= 0
      ? realScore.toNumber()
      : (realScore.toNumber() * weights.consensus +
          (noiseScore?.toNumber() ?? 100) * weights.noise +
          (qualityScore?.toNumber() ?? 100) * weights.quality +
          (livenessScore?.toNumber() ?? 100) * weights.liveness) /
        weightSum;

  return Math.max(scoreRange.min, Math.min(scoreRange.max, blended));
}

/** Duplicated from services/settlement-job/src/settlement.service.ts -- see this file's own doc comment for why. */
function computeWordRecordingCompositeScore(
  realScore: Prisma.Decimal,
  noiseScore: Prisma.Decimal | null,
  qualityScore: Prisma.Decimal | null,
  livenessScore: Prisma.Decimal | null,
  asrMatchScore: Prisma.Decimal | null,
  weights: QualityWeights & { asrMatch: number },
  scoreRange: { min: number; max: number },
): number {
  const weightSum =
    weights.consensus + weights.noise + weights.quality + weights.liveness + weights.asrMatch;
  const blended =
    weightSum <= 0
      ? realScore.toNumber()
      : (realScore.toNumber() * weights.consensus +
          (noiseScore?.toNumber() ?? 100) * weights.noise +
          (qualityScore?.toNumber() ?? 100) * weights.quality +
          (livenessScore?.toNumber() ?? 100) * weights.liveness +
          (asrMatchScore?.toNumber() ?? 100) * weights.asrMatch) /
        weightSum;

  return Math.max(scoreRange.min, Math.min(scoreRange.max, blended));
}
