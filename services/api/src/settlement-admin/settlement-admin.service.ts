import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  computeTrainingPayout,
  creditTrainingPayoutOps,
  mintTrainingPayoutOps,
} from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { TokenomicsService } from '../tokenomics/tokenomics.service';
import { SmsService } from '../sms/sms.service';
import { ListUnsettledDto } from './dto/list-unsettled.dto';

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
 * deliberately kept identical to settleWordRecordings (same no-loss
 * formula, same lock-release/credit/mint/status-update transaction) so a
 * row settled manually here is indistinguishable from one settled by the
 * cron job -- this exists purely to let an admin clear a row the cron
 * either hasn't reached yet or threw on (its loop is per-row try/catch, not
 * all-or-nothing, so a bad row is silently retried forever without
 * visibility -- this list is that visibility).
 */
@Injectable()
export class SettlementAdminService {
  private readonly logger = new Logger(SettlementAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly tokenomics: TokenomicsService,
    private readonly sms: SmsService,
  ) {}

  /** Best-effort SMS to the referrer credited a payout bonus off this settlement -- mirrors WalletController.notifyReferralFundingBonusesSms, never blocks the settle-row transaction. */
  private async notifyReferralPayoutBonusSms(
    referrerUserId: string,
    amount: string,
  ): Promise<void> {
    try {
      const enabled = await this.settings.isReferralSmsPayoutBonusEnabled();
      if (!enabled) return;
      const user = await this.prisma.user.findUnique({
        where: { id: referrerUserId },
        select: { phoneNumber: true, phoneVerifiedAt: true, smsNotificationsEnabled: true },
      });
      if (!user?.phoneNumber || !user.phoneVerifiedAt || !user.smsNotificationsEnabled) return;
      await this.sms.sendTransactional(
        user.phoneNumber,
        `Dialect Library: You earned a ${amount} DL referral bonus from your referral's training payout.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send referral payout-bonus SMS for user=${referrerUserId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listUnsettled(query: ListUnsettledDto) {
    const settlementDelayMinutes = await this.settings.getSettlementDelayMinutes();
    const dueBefore = new Date(Date.now() - settlementDelayMinutes * 60_000);

    const rows = await this.fetchUnsettledWordRecordings(query.userId);
    const merged = rows
      .map((row) => this.toSummary(row, settlementDelayMinutes, dueBefore))
      .sort((a, b) => a.scoredAt.localeCompare(b.scoredAt));

    const total = merged.length;
    const skip = (query.page - 1) * query.pageSize;
    const items = merged.slice(skip, skip + query.pageSize);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      stuckCount: merged.filter((row) => !row.pendingDelay && row.status === 'SCORED').length,
    };
  }

  /**
   * PENDING rows are included for visibility (they're still "held" tokens
   * the trainer can't spend) but are never settleable -- there's no score
   * yet to pay out against, they just sit here until the quality-gate/
   * scoring pipeline reaches them or settlement-job's SLA timeout expires
   * them. Only SCORED rows can be settled (see settleWordRecording's own
   * status check).
   */
  private fetchUnsettledWordRecordings(userId?: string) {
    return this.prisma.wordRecording.findMany({
      where: {
        status: { in: ['PENDING', 'SCORED'] },
        settledAt: null,
        userId: userId ?? { not: null },
      },
      orderBy: { scoredAt: 'asc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  private toSummary(
    row: {
      id: string;
      status: string;
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
      kind: 'word' as const,
      status: row.status as 'PENDING' | 'SCORED',
      trainer: row.user,
      tokensSpent: row.tokensSpent.toString(),
      score: row.score?.toString() ?? null,
      scoredAt: scoredAt.toISOString(),
      pendingDelay,
      missingScore: row.score === null,
    };
  }

  /**
   * Settles one row using the exact same formula and transaction shape as
   * settlement-job's settleWordRecordings -- see that service for the
   * canonical version this mirrors. `force` lets an admin settle a row
   * still inside the delay window (an explicit override of a soft
   * guardrail, not a bug -- the automated job simply hasn't picked it up
   * yet).
   */
  async settleOne(id: string, force: boolean) {
    const [
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
      economyEnabled,
    ] = await Promise.all([
      this.settings.getTrainingPayoutBonusCapMultiple(),
      this.settings.isQualityGateEnabled(),
      this.settings.getQualityWeights(),
      this.settings.getAsrMatchWeight(),
      this.settings.getScoreRange(),
      this.settings.getSettlementDelayMinutes(),
      this.tokenomics.isMintingPaused(),
      this.settings.isTrainingEconomyEnabled(),
    ]);

    return this.settleWordRecording(id, force, {
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
      economyEnabled,
    });
  }

  /**
   * Bulk variant of settleOne -- settles every currently-eligible row (same
   * per-row try/catch-and-continue behavior as settlement-job's own run, so
   * one bad row can't block the rest). `force` applies uniformly to every
   * row in scope.
   */
  async settleAll(force: boolean) {
    const [
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
      economyEnabled,
    ] = await Promise.all([
      this.settings.getTrainingPayoutBonusCapMultiple(),
      this.settings.isQualityGateEnabled(),
      this.settings.getQualityWeights(),
      this.settings.getAsrMatchWeight(),
      this.settings.getScoreRange(),
      this.settings.getSettlementDelayMinutes(),
      this.tokenomics.isMintingPaused(),
      this.settings.isTrainingEconomyEnabled(),
    ]);

    let settledCount = 0;
    let failedCount = 0;
    let skippedDelayCount = 0;

    const rows = await this.fetchUnsettledWordRecordings();
    for (const row of rows) {
      // PENDING rows have no score yet to pay out against -- they aren't a
      // failure, just not this job's job (see fetchUnsettledWordRecordings).
      if (row.status !== 'SCORED') continue;
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
          economyEnabled,
        });
        settledCount += 1;
      } catch (err) {
        failedCount += 1;
        this.logger.error(
          `Manual settle failed for wordRecording=${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { settledCount, failedCount, skippedDelayCount };
  }

  private isPendingDelay(scoredAt: Date, settlementDelayMinutes: number): boolean {
    return (
      settlementDelayMinutes > 0 &&
      scoredAt > new Date(Date.now() - settlementDelayMinutes * 60_000)
    );
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
      economyEnabled: boolean;
    },
  ) {
    const recording = await this.prisma.wordRecording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundException('Word recording not found');
    if (recording.status !== 'SCORED' || recording.settledAt) {
      throw new UnprocessableEntityException(
        'This word recording is not currently eligible for settlement',
      );
    }
    if (recording.score === null || recording.userId === null) {
      throw new UnprocessableEntityException(
        'This word recording has no score or trainer and cannot be settled',
      );
    }
    const userId = recording.userId;
    if (
      !force &&
      this.isPendingDelay(recording.scoredAt ?? recording.createdAt, ctx.settlementDelayMinutes)
    ) {
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
    const sourceKey = trainingPayoutSourceKey(recording.wordId, recording.sentenceId);
    // See SettlementService.settleWordRecordings -- with the training
    // economy off there is nothing to credit, so credit and mint are both
    // skipped rather than run for zero.
    const { ops, result } = ctx.economyEnabled
      ? await creditTrainingPayoutOps(this.prisma, userId, payout, recording.id)
      : { ops: [], result: null };
    const mintOps =
      ctx.mintingPaused || !ctx.economyEnabled
        ? []
        : (await mintTrainingPayoutOps(this.prisma, userId, payout, recording.id)).ops;
    const lockOps = (await this.isStakeStillLocked(recording.id))
      ? [
          this.prisma.wallet.updateMany({
            // gte guard -- this release writes no ledger row (the stake is
            // consumed by the payout), so an over-release is invisible to
            // reconciliation. See SettlementService's matching comment.
            where: { userId, lockedBalance: { gte: recording.tokensSpent } },
            data: { lockedBalance: { decrement: recording.tokensSpent } },
          }),
        ]
      : [];

    try {
      await this.prisma.$transaction([
        ...(sourceKey
          ? [
              this.prisma.trainingPayoutClaim.create({
                data: { userId, sourceKey, recordingId: recording.id },
              }),
            ]
          : []),
        ...lockOps,
        ...ops,
        ...mintOps,
        this.prisma.wordRecording.update({
          where: { id: recording.id },
          data: {
            status: 'SETTLED',
            compositeScore,
            payoutTokenAmount: payout,
            settledAt: new Date(),
          },
        }),
      ]);
    } catch (err) {
      if (!sourceKey || !isUniqueConstraintError(err)) throw err;
      const existingClaim = await this.prisma.trainingPayoutClaim.findUnique({
        where: { userId_sourceKey: { userId, sourceKey } },
        select: { recordingId: true },
      });
      if (existingClaim?.recordingId === recording.id) {
        throw new UnprocessableEntityException('This word recording is already being settled');
      }
      if (!existingClaim) throw err;
      await this.settleDuplicateSourceWithoutReward({ ...recording, userId });
      return { id: recording.id, payoutTokenAmount: '0' };
    }

    this.logger.log(`Manually settled wordRecording=${recording.id} payout=${payout.toString()}`);
    if (result?.referrerUserId && Number(result.referralPayoutBonus) > 0) {
      void this.notifyReferralPayoutBonusSms(result.referrerUserId, result.referralPayoutBonus);
    }
    return { id: recording.id, payoutTokenAmount: payout.toString() };
  }

  /**
   * Whether this row's stake is STILL SITTING in lockedBalance. Mirrors
   * SettlementService.isStakeStillLocked -- a TASK_LOCK entry alone only
   * proves a lock was once taken, not that it is still held, so asking that
   * question released already-refunded stakes a second time and drove
   * lockedBalance negative.
   */
  private async isStakeStillLocked(reference: string): Promise<boolean> {
    const [lock, release] = await Promise.all([
      this.prisma.ledgerEntry.findFirst({
        where: { reference, type: 'TASK_LOCK' },
        select: { id: true },
      }),
      this.prisma.ledgerEntry.findFirst({
        where: { reference, type: 'TASK_REFUND' },
        select: { id: true },
      }),
    ]);
    return lock !== null && release === null;
  }

  /** A repeat source remains auditable, but its locked stake is returned without a reward. */
  private async settleDuplicateSourceWithoutReward(recording: {
    id: string;
    userId: string;
    tokensSpent: Prisma.Decimal;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.wordRecording.updateMany({
        where: { id: recording.id, status: 'SCORED', settledAt: null },
        data: {
          status: 'SETTLED',
          payoutTokenAmount: new Prisma.Decimal(0),
          settledAt: new Date(),
        },
      });
      if (claimed.count === 0) return;

      // "Still held", not "was ever locked" -- returning an already-returned
      // stake writes a second TASK_REFUND, crediting the trainer twice and
      // decrementing lockedBalance for tokens that are no longer there. Same
      // fix as SettlementService.settleDuplicateSourceWithoutReward.
      const [lock, alreadyRefunded] = await Promise.all([
        tx.ledgerEntry.findFirst({
          where: { reference: recording.id, type: 'TASK_LOCK' },
          select: { id: true },
        }),
        tx.ledgerEntry.findFirst({
          where: { reference: recording.id, type: 'TASK_REFUND' },
          select: { id: true },
        }),
      ]);
      if (!lock || alreadyRefunded) return;

      const wallet = await tx.wallet.upsert({
        where: { userId: recording.userId },
        update: {},
        create: { userId: recording.userId },
      });
      const released = await tx.wallet.updateMany({
        where: { id: wallet.id, lockedBalance: { gte: recording.tokensSpent } },
        data: {
          lockedBalance: { decrement: recording.tokensSpent },
          balance: { increment: recording.tokensSpent },
        },
      });
      if (released.count === 0) return;
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'TASK_REFUND',
          amount: recording.tokensSpent,
          reference: recording.id,
        },
      });
    });
  }
}

function trainingPayoutSourceKey(wordId: string | null, sentenceId: string | null): string | null {
  if (wordId) return `word:${wordId}`;
  if (sentenceId) return `sentence:${sentenceId}`;
  return null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
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
