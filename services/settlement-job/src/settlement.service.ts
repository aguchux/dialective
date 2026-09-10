import { Injectable, Logger } from '@nestjs/common';
import {
  computeTrainingPayout,
  creditTrainingPayoutOps,
  mintTrainingPayoutOps,
  Prisma,
} from '@dialectiva/db';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage.service';
import { SmsNotifierService } from './sms/sms-notifier.service';

/** Uniform random draw in [min, max] -- a payout-fairness randomizer, not a security value, so Math.random() is fine. */
function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

function trainingPayoutSourceKey(wordId: string | null, sentenceId: string | null): string | null {
  if (wordId) return `word:${wordId}`;
  if (sentenceId) return `sentence:${sentenceId}`;
  return null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export interface QualityWeights {
  consensus: number;
  noise: number;
  quality: number;
  liveness: number;
}

/**
 * Blends the real exact-match/reverse-validation score with quality-gate-
 * worker's four signals (weighted average, admin-configurable weights, plus
 * asrMatchScore -- see WordRecording.asrMatchScore's schema comment), then
 * clamps the result into [minScoreRange, maxScoreRange] -- the same range
 * the no-fail-on-train synthetic-timeout path already respects (see
 * scoreWithSyntheticScore's randomInRange). Unlike that path, this is a
 * deterministic computation from real signals, never a random draw. Missing
 * noise/quality/liveness/asrMatch scores (gate disabled when the row was
 * created, or the async worker hasn't written them yet) fall back to a
 * neutral 100 so absence never penalizes a trainer -- see schema.prisma's
 * compositeScore comment.
 */
export function computeWordRecordingCompositeScore(
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

export interface DomainConversationQualityWeights {
  noise: number;
  quality: number;
  liveness: number;
}

/**
 * Blends quality-gate-worker's three quality signals for a
 * DomainConversationRecording -- no consensus/exact-match/asrMatch
 * component exists for this record kind (no fixed expected text to compare
 * a free-form conversational clip against), unlike
 * computeWordRecordingCompositeScore's five-way blend. Missing noise/
 * quality/liveness scores (gate disabled when the row was created, or the
 * async worker hasn't written them yet) fall back to a neutral 100, same
 * absence-never-penalizes posture as the WordRecording version.
 */
export function computeDomainConversationCompositeScore(
  noiseScore: Prisma.Decimal | null,
  qualityScore: Prisma.Decimal | null,
  livenessScore: Prisma.Decimal | null,
  weights: DomainConversationQualityWeights,
): number {
  const weightSum = weights.noise + weights.quality + weights.liveness;
  if (weightSum <= 0) return 100;
  return (
    ((noiseScore?.toNumber() ?? 100) * weights.noise +
      (qualityScore?.toNumber() ?? 100) * weights.quality +
      (livenessScore?.toNumber() ?? 100) * weights.liveness) /
    weightSum
  );
}

/**
 * Reads scored-but-unsettled WordRecording rows from Postgres, computes
 * each payout via the shared no-loss formula (computeTrainingPayout in
 * @dialectiva/db -- same math api's manual admin/training-payouts route
 * uses), and writes wallet ledger entries against the client-funded Reward
 * Pool (never funded by other trainers' token purchases -- see business
 * plan §4-5). Processed sequentially, not as one giant transaction, so one
 * bad row logs-and-continues rather than rolling back an entire run's worth
 * of otherwise-valid payouts; anything left SCORED with settledAt: null is
 * naturally retried on the next scheduled run.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly smsNotifier: SmsNotifierService,
  ) {}

  async run(): Promise<void> {
    this.logger.log('Settlement run starting');

    const bonusCapMultiple = await this.getTrainingPayoutBonusCapMultiple();
    const [
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
    ] = await Promise.all([
      this.isQualityGateEnabled(),
      this.getQualityWeights(),
      this.getAsrMatchWeight(),
      this.getScoreRange(),
      this.getSettlementDelayMinutes(),
      this.isTokenomicsMintingPaused(),
    ]);

    const wordRecordingResult = await this.settleWordRecordings(
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
      mintingPaused,
    );
    const rejectedWordRecordingRefundCount = await this.refundRejectedWordRecordings();
    const stuckRefundCount = await this.refundStuckWordRecordings();
    const timeoutResult = await this.resolveTimedOutScoring();

    const domainConversationQualityWeights = await this.getDomainConversationQualityWeights();
    const domainConversationMinQualityScoreForPayout =
      await this.getDomainConversationMinQualityScoreForPayout();
    const domainConversationResult = await this.settleDomainConversationRecordings(
      domainConversationQualityWeights,
      domainConversationMinQualityScoreForPayout,
      settlementDelayMinutes,
      mintingPaused,
    );
    const rejectedDomainConversationRefundCount =
      await this.refundRejectedDomainConversationRecordings();
    const stuckDomainConversationRefundCount = await this.refundStuckDomainConversationRecordings();

    const settledCount = wordRecordingResult.settledCount + domainConversationResult.settledCount;
    const eligibleCount = wordRecordingResult.eligibleCount + domainConversationResult.eligibleCount;
    const totalPayout = wordRecordingResult.totalPayout + domainConversationResult.totalPayout;

    if (
      rejectedWordRecordingRefundCount > 0 ||
      stuckRefundCount > 0 ||
      timeoutResult.refundedCount > 0 ||
      rejectedDomainConversationRefundCount > 0 ||
      stuckDomainConversationRefundCount > 0
    ) {
      this.logger.log(
        `Refunded locked tokens: rejectedWordRecordings=${rejectedWordRecordingRefundCount} ` +
          `stuckWordRecordings=${stuckRefundCount} scoringTimeout=${timeoutResult.refundedCount} ` +
          `rejectedDomainConversationRecordings=${rejectedDomainConversationRefundCount} ` +
          `stuckDomainConversationRecordings=${stuckDomainConversationRefundCount}`,
      );
    }
    if (timeoutResult.scoredCount > 0) {
      this.logger.log(
        `Synthetic-scored ${timeoutResult.scoredCount} timed-out task(s) via noFailOnTrain -- ` +
          `will settle after settlementDelayMinutes on a future run`,
      );
    }

    if (eligibleCount === 0) {
      this.logger.log('Settlement run complete: nothing to settle');
      return;
    }

    this.logger.log(
      `Settlement run complete: settled=${settledCount}/${eligibleCount} totalPayout=${totalPayout.toFixed(2)}`,
    );
  }

  /**
   * Reads scored-but-unsettled WordRecording rows, computes each payout via
   * the shared no-loss formula, and writes wallet ledger entries against
   * the client-funded Reward Pool -- see the model's doc comment in
   * schema.prisma.
   */
  private async settleWordRecordings(
    bonusCapMultiple: number,
    qualityGateEnabled: boolean,
    qualityWeights: QualityWeights,
    asrMatchWeight: number,
    scoreRange: { min: number; max: number },
    settlementDelayMinutes: number,
    mintingPaused: boolean,
  ) {
    const recordings = await this.prisma.wordRecording.findMany({
      where: {
        status: 'SCORED',
        settledAt: null,
        userId: { not: null },
        ...(settlementDelayMinutes > 0
          ? { scoredAt: { lte: new Date(Date.now() - settlementDelayMinutes * 60_000) } }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        wordId: true,
        sentenceId: true,
        tokensSpent: true,
        rawScore: true,
        score: true,
        noiseScore: true,
        qualityScore: true,
        livenessScore: true,
        asrMatchScore: true,
      },
    });

    let settledCount = 0;
    let totalPayout = 0;

    for (const recording of recordings) {
      if (recording.score === null || recording.userId === null) {
        this.logger.warn(
          `Skipping wordRecording=${recording.id}: status SCORED but score/userId missing`,
        );
        continue;
      }
      const userId = recording.userId;

      try {
        const realScore = recording.rawScore ?? recording.score;
        const compositeScore = computeWordRecordingCompositeScore(
          realScore,
          recording.noiseScore,
          recording.qualityScore,
          recording.livenessScore,
          recording.asrMatchScore,
          { ...qualityWeights, asrMatch: asrMatchWeight },
          scoreRange,
        );
        const payoutScore = qualityGateEnabled ? compositeScore : recording.score;
        const payout = computeTrainingPayout(recording.tokensSpent, payoutScore, bonusCapMultiple);
        const sourceKey = trainingPayoutSourceKey(recording.wordId, recording.sentenceId);
        const { ops, result } = await creditTrainingPayoutOps(
          this.prisma,
          userId,
          payout,
          recording.id,
        );
        // Same Tokenomics-mint-alongside-legacy-credit pattern as
        // settleSubmissions -- see mintTrainingPayoutOps's doc comment.
        const mintOps = mintingPaused
          ? []
          : (await mintTrainingPayoutOps(this.prisma, userId, payout, recording.id)).ops;

        // Same lock-release-alongside-payout pattern as settleSubmissions,
        // same legacy-row guard.
        const lockOps = (await this.wasLocked(recording.id))
          ? [
              this.prisma.wallet.updateMany({
                where: { userId },
                data: { lockedBalance: { decrement: recording.tokensSpent } },
              }),
            ]
          : [];
        try {
          await this.prisma.$transaction([
            // The ledger reference protects retries of one recording. This
            // claim also protects repeat recordings of the same source item.
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
          if (existingClaim?.recordingId === recording.id) continue;
          if (!existingClaim) throw err;
          await this.settleDuplicateSourceWithoutReward({ ...recording, userId });
        }

        if (result.referrerUserId && Number(result.referralPayoutBonus) > 0) {
          void this.smsNotifier.notifyReferralPayoutBonus(
            result.referrerUserId,
            result.referralPayoutBonus,
          );
        }

        settledCount += 1;
        totalPayout += payout.toNumber();
      } catch (err) {
        this.logger.error(
          `Failed to settle wordRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { settledCount, eligibleCount: recordings.length, totalPayout };
  }

  /**
   * REJECTED word recordings never reach SCORED, so settleWordRecordings
   * never sees them and their locked stake would otherwise sit in
   * lockedBalance forever. quality-gate-worker sets REJECTED via a direct
   * SQL UPDATE (see AGENTS.md "Database access" -- other services touch
   * this schema only through the generated Prisma client, api owns it), so
   * the refund itself happens here instead, in the one place already
   * scheduled to reconcile locked tokens against final outcomes. refundedAt
   * makes this idempotent/resumable the same way settledAt does for
   * payouts -- a row left REJECTED with refundedAt: null is naturally
   * retried next run.
   *
   * Audio is deleted synchronously in the same pass, not left for
   * audio-retention-job's delayed sweep -- a quality-rejected clip (silence/
   * noise/unreadable) has no further use once refunded, unlike a
   * settled/scored recording an admin might still want to audit within the
   * configured retention window.
   */
  private async refundRejectedWordRecordings(): Promise<number> {
    const recordings = await this.prisma.wordRecording.findMany({
      where: { status: 'REJECTED', refundedAt: null },
      select: { id: true, userId: true, tokensSpent: true, audioBucket: true, audioKey: true },
    });

    let refundedCount = 0;
    for (const recording of recordings) {
      if (recording.userId === null) continue;
      try {
        const claim = await this.prisma.wordRecording.updateMany({
          where: { id: recording.id, refundedAt: null },
          data: { refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        if (await this.wasLocked(recording.id)) {
          await this.refundTokens(recording.userId, recording.tokensSpent, recording.id);
        }
        await this.deleteAudioIfPresent(recording.id, recording.audioBucket, recording.audioKey);
        refundedCount += 1;
      } catch (err) {
        this.logger.error(
          `Failed to refund rejected wordRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return refundedCount;
  }

  /**
   * Deletes the Spaces object and nulls audioBucket/audioKey (setting
   * audioDeletedAt) in the same shape audio-retention-job's maybePurge
   * already uses -- so a row deleted here is indistinguishable from one
   * purged by the delayed sweep, and that sweep's own `audioBucket !=
   * null, audioKey != null` guard means it will never re-attempt this
   * object. Best-effort: a Spaces failure is logged, not thrown -- the
   * refund itself must not roll back because a delete call failed
   * (the row keeps its audioBucket/audioKey and quietly becomes eligible
   * for audio-retention-job's own delayed purge as a fallback).
   */
  private async deleteAudioIfPresent(
    id: string,
    bucket: string | null,
    key: string | null,
  ): Promise<void> {
    if (!bucket || !key) return;
    try {
      await this.storage.deleteObject(bucket, key);
    } catch (err) {
      this.logger.warn(
        `Failed to delete audio for rejected wordRecording=${id} bucket=${bucket} key=${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    await this.prisma.wordRecording.update({
      where: { id },
      data: { audioBucket: null, audioKey: null, audioDeletedAt: new Date() },
    });
  }

  /**
   * An ENGLISH_TO_DIALECT WordRecording only scores once a peer's
   * DIALECT_TO_ENGLISH reverse-validation lands (see WordsService.
   * scoreReverseValidatedSource) -- if that never happens within
   * wordStuckTimeoutMinutes, its lock needs its own release path rather
   * than waiting on a SCORED transition that may never come. The row
   * itself moves to EXPIRED (same terminal state resolveTimedOutScoring
   * uses) so it stops reading as "still awaiting validation" forever --
   * it remains just as eligible for WordsService.pickReverseSource as a
   * peer-validation source afterward, since that query has no status
   * filter; only this row's own lifecycle is what's being resolved here.
   * (Previously this only set refundedAt and left status untouched, which
   * both correctly refunded the trainer AND permanently hid the row from
   * every future settlement-job sweep -- both this one and
   * resolveTimedOutScoring filter on refundedAt: null -- leaving it
   * stuck at PENDING forever. See the 2026-09 migration that backfills
   * every row this bug already left stranded.)
   */
  private async refundStuckWordRecordings(): Promise<number> {
    const timeoutMinutes = await this.getWordStuckTimeoutMinutes();
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const recordings = await this.prisma.wordRecording.findMany({
      where: {
        status: 'PENDING',
        direction: 'ENGLISH_TO_DIALECT',
        refundedAt: null,
        userId: { not: null },
        createdAt: { lt: cutoff },
      },
      select: { id: true, userId: true, tokensSpent: true },
    });

    let refundedCount = 0;
    for (const recording of recordings) {
      if (recording.userId === null) continue;
      try {
        // Atomic claim on refundedAt: null before touching tokens -- two
        // overlapping settlement-job runs both reading refundedAt: null via
        // findMany above would otherwise both refund the same row (the
        // ledger's walletId+type+reference unique constraint catches the
        // second write, but only after refundTokens already ran).
        const claim = await this.prisma.wordRecording.updateMany({
          where: { id: recording.id, refundedAt: null },
          data: { status: 'EXPIRED', refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        // Legacy (pre-locking) rows spent balance directly and never locked
        // anything -- nothing to refund, just mark them resolved.
        if (await this.wasLocked(recording.id)) {
          await this.refundTokens(recording.userId, recording.tokensSpent, recording.id);
        }
        refundedCount += 1;
      } catch (err) {
        this.logger.error(
          `Failed to refund stuck wordRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return refundedCount;
  }

  /**
   * A WordRecording still PENDING outside the ENGLISH_TO_DIALECT
   * stuck-timeout path already covered by refundStuckWordRecordings) past
   * scoringSlaMinutes needs some resolution -- otherwise its lock sits
   * forever waiting on a reverse-validation outcome that may never land.
   * When noFailOnTrainEnabled is off, this is a plain refund (same shape as
   * refundRejectedWordRecordings/refundStuckWordRecordings -- stake back,
   * no bonus). When on, the trainer did complete and submit real work, so
   * instead of a bare refund it's given a synthetic score drawn uniformly
   * from [minScoreRange, maxScoreRange] and moved to SCORED (not straight
   * to SETTLED) -- this hands it to the normal settleWordRecordings pass
   * above, so it still waits out settlementDelayMinutes like every other
   * scored row instead of paying out in the same instant it's scored.
   */
  private async resolveTimedOutScoring() {
    const [slaMinutes, noFailEnabled, scoreRange] = await Promise.all([
      this.getScoringSlaMinutes(),
      this.isNoFailOnTrainEnabled(),
      this.getScoreRange(),
    ]);
    const cutoff = new Date(Date.now() - slaMinutes * 60 * 1000);

    const timedOutRecordings = await this.prisma.wordRecording.findMany({
      where: {
        status: 'PENDING',
        refundedAt: null,
        userId: { not: null },
        createdAt: { lt: cutoff },
      },
      select: { id: true, userId: true, tokensSpent: true },
    });

    let scoredCount = 0;
    let refundedCount = 0;

    for (const recording of timedOutRecordings) {
      if (recording.userId === null) continue;
      try {
        // Atomic claim, guarded on the same status this row was read with --
        // this is the hard handoff point: once claimed, quality-gate-worker's
        // own status-guarded writes can no longer touch this row, even if a
        // scoring job for it is mid-flight right now. If a concurrent
        // settlement-job run already claimed it first, count is 0 and this
        // run skips it -- no double refund/payout.
        const claim = await this.prisma.wordRecording.updateMany({
          where: { id: recording.id, status: 'PENDING', refundedAt: null },
          data: { status: 'EXPIRED', refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        if (noFailEnabled) {
          await this.scoreWithSyntheticScore(recording.id, scoreRange);
          scoredCount += 1;
        } else {
          await this.refundTokens(recording.userId, recording.tokensSpent, recording.id);
          refundedCount += 1;
        }
      } catch (err) {
        this.logger.error(
          `Failed to resolve timed-out wordRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { scoredCount, refundedCount };
  }

  /**
   * Moves a timed-out (EXPIRED, noFailOnTrainEnabled) row to SCORED with a
   * synthetic score -- it does NOT credit payout or touch locked tokens.
   * That happens later, in settleWordRecordings, once
   * settlementDelayMinutes has elapsed since this scoredAt -- the same path
   * every real exact-match/reverse-validation score goes through. See
   * resolveTimedOutScoring's doc comment for why this was split out of what
   * used to be a single score+settle step.
   */
  private async scoreWithSyntheticScore(
    id: string,
    scoreRange: { min: number; max: number },
  ): Promise<void> {
    const score = randomInRange(scoreRange.min, scoreRange.max);
    await this.prisma.wordRecording.update({
      where: { id },
      data: { rawScore: score, score, status: 'SCORED', scoredAt: new Date() },
    });
  }

  private async refundTokens(
    userId: string,
    tokensSpent: Prisma.Decimal,
    reference: string,
  ): Promise<void> {
    // Legacy (pre-locking) rows spent balance directly and never locked
    // anything -- decrementing lockedBalance for them would drive it
    // negative, so only touch it for rows that actually have a lock.
    const locked = await this.wasLocked(reference);
    await this.prisma.$transaction([
      this.prisma.wallet.updateMany({
        where: { userId },
        data: locked
          ? { lockedBalance: { decrement: tokensSpent }, balance: { increment: tokensSpent } }
          : { balance: { increment: tokensSpent } },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: (await this.getOrCreateWallet(userId)).id,
          type: 'TASK_REFUND',
          amount: tokensSpent,
          reference,
        },
      }),
    ]);
  }

  /** A repeat source is retained as data but cannot earn a second payout. */
  private async settleDuplicateSourceWithoutReward(recording: {
    id: string;
    userId: string;
    tokensSpent: Prisma.Decimal;
  }): Promise<void> {
    const resolved = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.wordRecording.updateMany({
        where: { id: recording.id, status: 'SCORED', settledAt: null },
        data: {
          status: 'SETTLED',
          payoutTokenAmount: new Prisma.Decimal(0),
          settledAt: new Date(),
        },
      });
      if (claimed.count === 0) return false;

      const lock = await tx.ledgerEntry.findFirst({
        where: { reference: recording.id, type: 'TASK_LOCK' },
        select: { id: true },
      });
      if (!lock) return true;

      const wallet = await tx.wallet.upsert({
        where: { userId: recording.userId },
        update: {},
        create: { userId: recording.userId },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          lockedBalance: { decrement: recording.tokensSpent },
          balance: { increment: recording.tokensSpent },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'TASK_REFUND',
          amount: recording.tokensSpent,
          reference: recording.id,
        },
      });
      return true;
    });
    if (resolved) {
      this.logger.warn(`Settled repeat source without reward wordRecording=${recording.id}`);
    }
  }

  /**
   * Mirrors PlatformSettingsService.getScoringSlaMinutes/isNoFailOnTrainEnabled/
   * getScoreRange's DB-override/env-fallback logic -- see
   * getTrainingPayoutBonusCapMultiple above for why this is a duplicated
   * read, not duplicated business logic.
   */
  private async getScoringSlaMinutes(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return row.scoringSlaMinutes || 60;
  }

  private async isNoFailOnTrainEnabled(): Promise<boolean> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return row.noFailOnTrainEnabled;
  }

  /**
   * Mirrors PlatformSettingsService.getSettlementDelayMinutes -- see
   * getTrainingPayoutBonusCapMultiple above for why this is a duplicated
   * read, not duplicated business logic. 0 (the default) settles a SCORED
   * row as soon as the next run sees it, matching today's behavior exactly.
   */
  private async getSettlementDelayMinutes(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return row.settlementDelayMinutes || 0;
  }

  private async getScoreRange(): Promise<{ min: number; max: number }> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return { min: row.minScoreRange.toNumber(), max: row.maxScoreRange.toNumber() };
  }

  /**
   * Mirrors PlatformSettingsService.isQualityGateEnabled/getQualityWeights'
   * DB-read logic -- see getTrainingPayoutBonusCapMultiple above for why
   * this is a duplicated read, not duplicated business logic. Unlike most
   * other settings here, these have no env-var fallback -- they're new
   * fields with sane non-null defaults set at the schema level.
   */
  private async isQualityGateEnabled(): Promise<boolean> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return row.qualityGateEnabled;
  }

  private async getQualityWeights(): Promise<QualityWeights> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return {
      consensus: row.qualityWeightConsensus.toNumber(),
      noise: row.qualityWeightNoise.toNumber(),
      quality: row.qualityWeightQuality.toNumber(),
      liveness: row.qualityWeightLiveness.toNumber(),
    };
  }

  /** WordRecording-only weight (see computeWordRecordingCompositeScore) -- kept separate from getQualityWeights since Submission's blend has no equivalent term. Defaults to 0 (opt-in, additive, not part of the other four's sum-to-100 group). */
  private async getAsrMatchWeight(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return row.qualityWeightAsrMatch.toNumber();
  }

  private async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { userId } });
  }

  /**
   * Rows created before the token-locking feature shipped were debited via
   * the old TASK_SPEND path (balance only, lockedBalance never touched) --
   * releasing a lock for those would decrement lockedBalance for money that
   * was never put there, driving it negative. Every release site checks
   * this first and only moves lockedBalance for rows that actually have a
   * matching TASK_LOCK ledger entry.
   */
  private async wasLocked(reference: string): Promise<boolean> {
    const lock = await this.prisma.ledgerEntry.findFirst({
      where: { reference, type: 'TASK_LOCK' },
      select: { id: true },
    });
    return lock !== null;
  }

  /**
   * Mirrors TokenomicsService.isEnabled/ensurePolicy's upsert-by-'default'-id
   * shape (same reasoning as the other getX helpers above: this is a
   * separate NestJS module tree from services/api, so it re-reads the row
   * directly rather than importing TokenomicsService). Only gates whether
   * this run mints into the Tokenomics TokenAccount ledger -- never the
   * legacy Wallet credit trainers are actually paid from.
   */
  private async isTokenomicsMintingPaused(): Promise<boolean> {
    const policy = await this.prisma.tokenomicsPolicy.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return policy.mintingPaused;
  }

  /**
   * Mirrors PlatformSettingsService.getWordStuckTimeoutMinutes's
   * DB-override/env-fallback logic -- see getTrainingPayoutBonusCapMultiple
   * above for why this is a duplicated read, not duplicated business logic.
   */
  private async getWordStuckTimeoutMinutes(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    if (row.wordStuckTimeoutMinutes) {
      return row.wordStuckTimeoutMinutes;
    }
    const raw = process.env.WORD_STUCK_TIMEOUT_MINUTES ?? '1440';
    const minutes = Number(raw);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 1440;
  }

  /**
   * Mirrors PlatformSettingsService.getTrainingPayoutBonusCapMultiple's
   * DB-override/env-fallback logic -- duplicated read, not duplicated
   * business logic (this service can't import api's SettingsModule across
   * process boundaries, and the formula itself lives once, shared, in
   * @dialectiva/db).
   */
  private async getTrainingPayoutBonusCapMultiple(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    if (row.trainingPayoutBonusCapMultiple) {
      return row.trainingPayoutBonusCapMultiple.toNumber();
    }
    const raw = process.env.TRAINING_PAYOUT_BONUS_CAP_MULTIPLE ?? '1.0';
    const cap = Number(raw);
    return Number.isFinite(cap) && cap >= 0 ? cap : 1.0;
  }

  // --- Domain Conversation settlement --------------------------------------
  // Simpler than WordRecording's: no consensus/exact-match ground truth to
  // scale a bonus off (see DomainConversationRecording's schema doc
  // comment), so a SCORED row pays out FLAT tokensSpent once compositeScore
  // clears domainConversationMinQualityScoreForPayout, else refunds -- no
  // computeTrainingPayout, no TrainingPayoutClaim dedup (there is no
  // "source" concept here to dedup repeat attempts against).

  /**
   * Reads SCORED-but-unsettled DomainConversationRecording rows, computes
   * compositeScore from quality-gate-worker's noise/quality/liveness
   * signals, and either settles (flat payout) or refunds depending on
   * whether it clears the admin-configured quality floor. Mirrors
   * settleWordRecordings' sequential-not-transactional posture -- one bad
   * row logs-and-continues.
   */
  private async settleDomainConversationRecordings(
    qualityWeights: DomainConversationQualityWeights,
    minQualityScoreForPayout: number,
    settlementDelayMinutes: number,
    mintingPaused: boolean,
  ) {
    const recordings = await this.prisma.domainConversationRecording.findMany({
      where: {
        status: 'SCORED',
        settledAt: null,
        userId: { not: null },
        ...(settlementDelayMinutes > 0
          ? { scoredAt: { lte: new Date(Date.now() - settlementDelayMinutes * 60_000) } }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        tokensSpent: true,
        noiseScore: true,
        qualityScore: true,
        livenessScore: true,
      },
    });

    let settledCount = 0;
    let totalPayout = 0;

    for (const recording of recordings) {
      if (recording.userId === null) continue;
      const userId = recording.userId;

      try {
        const compositeScore = computeDomainConversationCompositeScore(
          recording.noiseScore,
          recording.qualityScore,
          recording.livenessScore,
          qualityWeights,
        );

        if (compositeScore < minQualityScoreForPayout) {
          const claim = await this.prisma.domainConversationRecording.updateMany({
            where: { id: recording.id, settledAt: null },
            data: { compositeScore, refundedAt: new Date() },
          });
          if (claim.count === 0) continue;
          if (await this.wasLocked(recording.id)) {
            await this.refundTokens(userId, recording.tokensSpent, recording.id);
          }
          continue;
        }

        const payout = recording.tokensSpent;
        const { ops, result } = await creditTrainingPayoutOps(this.prisma, userId, payout, recording.id);
        const mintOps = mintingPaused
          ? []
          : (await mintTrainingPayoutOps(this.prisma, userId, payout, recording.id)).ops;
        const lockOps = (await this.wasLocked(recording.id))
          ? [
              this.prisma.wallet.updateMany({
                where: { userId },
                data: { lockedBalance: { decrement: recording.tokensSpent } },
              }),
            ]
          : [];

        await this.prisma.$transaction([
          ...lockOps,
          ...ops,
          ...mintOps,
          this.prisma.domainConversationRecording.update({
            where: { id: recording.id },
            data: {
              status: 'SETTLED',
              compositeScore,
              payoutTokenAmount: payout,
              settledAt: new Date(),
            },
          }),
        ]);

        if (result.referrerUserId && Number(result.referralPayoutBonus) > 0) {
          void this.smsNotifier.notifyReferralPayoutBonus(
            result.referrerUserId,
            result.referralPayoutBonus,
          );
        }

        settledCount += 1;
        totalPayout += payout.toNumber();
      } catch (err) {
        this.logger.error(
          `Failed to settle domainConversationRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { settledCount, eligibleCount: recordings.length, totalPayout };
  }

  /** Mirrors refundRejectedWordRecordings -- REJECTED rows (quality-gate prefilter hard-reject) never reach SCORED, so the sweep above never sees them. */
  private async refundRejectedDomainConversationRecordings(): Promise<number> {
    const recordings = await this.prisma.domainConversationRecording.findMany({
      where: { status: 'REJECTED', refundedAt: null },
      select: { id: true, userId: true, tokensSpent: true, audioBucket: true, audioKey: true },
    });

    let refundedCount = 0;
    for (const recording of recordings) {
      if (recording.userId === null) continue;
      try {
        const claim = await this.prisma.domainConversationRecording.updateMany({
          where: { id: recording.id, refundedAt: null },
          data: { refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        if (await this.wasLocked(recording.id)) {
          await this.refundTokens(recording.userId, recording.tokensSpent, recording.id);
        }
        await this.deleteDomainConversationAudioIfPresent(
          recording.id,
          recording.audioBucket,
          recording.audioKey,
        );
        refundedCount += 1;
      } catch (err) {
        this.logger.error(
          `Failed to refund rejected domainConversationRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return refundedCount;
  }

  private async deleteDomainConversationAudioIfPresent(
    id: string,
    bucket: string | null,
    key: string | null,
  ): Promise<void> {
    if (!bucket || !key) return;
    try {
      await this.storage.deleteObject(bucket, key);
    } catch (err) {
      this.logger.warn(
        `Failed to delete audio for rejected domainConversationRecording=${id} bucket=${bucket} key=${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    await this.prisma.domainConversationRecording.update({
      where: { id },
      data: { audioBucket: null, audioKey: null, audioDeletedAt: new Date() },
    });
  }

  /**
   * A DomainConversationRecording still PENDING (quality-gate-worker never
   * ran, or never wrote scores) past wordStuckTimeoutMinutes needs its lock
   * released the same way an ENGLISH_TO_DIALECT WordRecording does via
   * refundStuckWordRecordings -- reuses the same admin-configured timeout
   * setting rather than introducing a separate one, since both represent
   * "this task's automated scoring pipeline never completed."
   */
  private async refundStuckDomainConversationRecordings(): Promise<number> {
    const timeoutMinutes = await this.getWordStuckTimeoutMinutes();
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const recordings = await this.prisma.domainConversationRecording.findMany({
      where: {
        status: 'PENDING',
        refundedAt: null,
        userId: { not: null },
        createdAt: { lt: cutoff },
      },
      select: { id: true, userId: true, tokensSpent: true },
    });

    let refundedCount = 0;
    for (const recording of recordings) {
      if (recording.userId === null) continue;
      try {
        const claim = await this.prisma.domainConversationRecording.updateMany({
          where: { id: recording.id, refundedAt: null },
          data: { status: 'EXPIRED', refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        if (await this.wasLocked(recording.id)) {
          await this.refundTokens(recording.userId, recording.tokensSpent, recording.id);
        }
        refundedCount += 1;
      } catch (err) {
        this.logger.error(
          `Failed to refund stuck domainConversationRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return refundedCount;
  }

  /** Mirrors PlatformSettingsService.getDomainConversationQualityWeights's DB-override/env-fallback logic -- duplicated read, not duplicated business logic. */
  private async getDomainConversationQualityWeights(): Promise<DomainConversationQualityWeights> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return {
      noise: row.domainConversationQualityWeightNoise.toNumber(),
      quality: row.domainConversationQualityWeightQuality.toNumber(),
      liveness: row.domainConversationQualityWeightLiveness.toNumber(),
    };
  }

  /** Mirrors PlatformSettingsService.getDomainConversationMinQualityScoreForPayout. */
  private async getDomainConversationMinQualityScoreForPayout(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return row.domainConversationMinQualityScoreForPayout.toNumber();
  }
}
