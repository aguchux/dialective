import { Injectable, Logger } from '@nestjs/common';
import { computeTrainingPayout, creditTrainingPayoutOps, Prisma } from '@dialectiva/db';
import { PrismaService } from './prisma/prisma.service';

/** Uniform random draw in [min, max] -- a payout-fairness randomizer, not a security value, so Math.random() is fine. */
function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

export interface QualityWeights {
  consensus: number;
  noise: number;
  quality: number;
  liveness: number;
}

/**
 * Blends the real consensus/exact-match score with the quality-gate-worker's
 * three signals (weighted average, admin-configurable weights), then clamps
 * the result into [minScoreRange, maxScoreRange] -- the same range the
 * no-fail-on-train synthetic-timeout path already respects (see
 * scoreWithSyntheticScore's randomInRange). Unlike that path, this is a
 * deterministic computation from real signals, never a random draw. Missing
 * noise/quality/liveness scores (gate disabled when the row was created, or
 * the async worker hasn't written them yet) fall back to a neutral 100 so
 * absence never penalizes a trainer -- see schema.prisma's compositeScore
 * comment.
 */
export function computeCompositeScore(
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

/**
 * WordRecording-only variant of computeCompositeScore, adding a 5th
 * asrMatchScore term (how closely the ASR transcript matches the trainer's
 * typed answer -- see WordRecording.asrMatchScore's schema comment).
 * Deliberately a separate function rather than a 5th parameter bolted onto
 * computeCompositeScore: Submission's ASR pipeline IS its consensus signal
 * already, so Submission settlement has no equivalent value to pass here,
 * and every Submission call site would otherwise need a dummy always-null
 * argument. qualityWeightAsrMatch defaults to 0, so until an admin opts in,
 * this produces the identical result computeCompositeScore always did.
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

/**
 * Reads scored-but-unsettled submissions from Postgres, computes each
 * payout via the shared no-loss formula (computeTrainingPayout in
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

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<void> {
    this.logger.log('Settlement run starting');

    const bonusCapMultiple = await this.getTrainingPayoutBonusCapMultiple();
    const [qualityGateEnabled, qualityWeights, asrMatchWeight, scoreRange, settlementDelayMinutes] =
      await Promise.all([
        this.isQualityGateEnabled(),
        this.getQualityWeights(),
        this.getAsrMatchWeight(),
        this.getScoreRange(),
        this.getSettlementDelayMinutes(),
      ]);

    const submissionResult = await this.settleSubmissions(
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      scoreRange,
      settlementDelayMinutes,
    );
    const wordRecordingResult = await this.settleWordRecordings(
      bonusCapMultiple,
      qualityGateEnabled,
      qualityWeights,
      asrMatchWeight,
      scoreRange,
      settlementDelayMinutes,
    );
    const rejectedRefundCount = await this.refundRejectedSubmissions();
    const stuckRefundCount = await this.refundStuckWordRecordings();
    const timeoutResult = await this.resolveTimedOutScoring();

    const settledCount = submissionResult.settledCount + wordRecordingResult.settledCount;
    const eligibleCount = submissionResult.eligibleCount + wordRecordingResult.eligibleCount;
    const totalPayout = submissionResult.totalPayout + wordRecordingResult.totalPayout;

    if (rejectedRefundCount > 0 || stuckRefundCount > 0 || timeoutResult.refundedCount > 0) {
      this.logger.log(
        `Refunded locked tokens: rejected=${rejectedRefundCount} stuckWordRecordings=${stuckRefundCount} ` +
          `scoringTimeout=${timeoutResult.refundedCount}`,
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

    const poolBalance = await this.getRewardPoolAvailableTokens();
    this.logger.log(
      `Settlement run complete: settled=${settledCount}/${eligibleCount} totalPayout=${totalPayout.toFixed(2)} ` +
        `poolAvailable=${poolBalance.toFixed(2)}`,
    );
  }

  private async settleSubmissions(
    bonusCapMultiple: number,
    qualityGateEnabled: boolean,
    qualityWeights: QualityWeights,
    scoreRange: { min: number; max: number },
    settlementDelayMinutes: number,
  ) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: 'SCORED',
        settledAt: null,
        ...(settlementDelayMinutes > 0
          ? { scoredAt: { lte: new Date(Date.now() - settlementDelayMinutes * 60_000) } }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        tokensSpent: true,
        rawScore: true,
        score: true,
        noiseScore: true,
        qualityScore: true,
        livenessScore: true,
      },
    });

    let settledCount = 0;
    let totalPayout = 0;

    for (const submission of submissions) {
      if (submission.score === null) {
        this.logger.warn(`Skipping submission=${submission.id}: status SCORED but score is null`);
        continue;
      }

      try {
        // compositeScore is only used to influence payout once
        // qualityGateEnabled -- otherwise it's still computed and stored
        // (useful for admin visibility/tuning) but computeTrainingPayout
        // gets the raw score, matching today's behavior exactly. See
        // computeCompositeScore's doc comment for the blend/clamp mechanism.
        const realScore = submission.rawScore ?? submission.score;
        const compositeScore = computeCompositeScore(
          realScore,
          submission.noiseScore,
          submission.qualityScore,
          submission.livenessScore,
          qualityWeights,
          scoreRange,
        );
        const payoutScore = qualityGateEnabled ? compositeScore : submission.score;
        const payout = computeTrainingPayout(submission.tokensSpent, payoutScore, bonusCapMultiple);
        const { ops } = await creditTrainingPayoutOps(
          this.prisma,
          submission.userId,
          payout,
          submission.id,
        );

        // Release the lock taken at submit time in the same transaction as
        // the payout credit -- no window where tokensSpent is neither
        // locked nor spendable. The lock is replaced, not "returned then
        // re-spent": the payout (stake + bonus) lands fresh in balance.
        // Legacy (pre-locking) rows never locked anything, so skip that decrement for them.
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
          this.prisma.submission.update({
            where: { id: submission.id },
            data: { compositeScore, payoutTokenAmount: payout, settledAt: new Date() },
          }),
        ]);

        settledCount += 1;
        totalPayout += payout.toNumber();
      } catch (err) {
        this.logger.error(
          `Failed to settle submission=${submission.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { settledCount, eligibleCount: submissions.length, totalPayout };
  }

  /**
   * Same no-loss formula/ledger path as settleSubmissions, against
   * WordRecording rows instead -- see the model's doc comment in
   * schema.prisma for why word training has its own SCORED path (no
   * consensus/quorum) but shares this settlement step.
   */
  private async settleWordRecordings(
    bonusCapMultiple: number,
    qualityGateEnabled: boolean,
    qualityWeights: QualityWeights,
    asrMatchWeight: number,
    scoreRange: { min: number; max: number },
    settlementDelayMinutes: number,
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
        const { ops } = await creditTrainingPayoutOps(
          this.prisma,
          recording.userId,
          payout,
          recording.id,
        );

        // Same lock-release-alongside-payout pattern as settleSubmissions,
        // same legacy-row guard.
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
          this.prisma.wordRecording.update({
            where: { id: recording.id },
            data: { compositeScore, payoutTokenAmount: payout, settledAt: new Date() },
          }),
        ]);

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
   * REJECTED submissions never reach SCORED, so settleSubmissions never
   * sees them and their locked stake would otherwise sit in lockedBalance
   * forever. vosk-worker/whisper-worker set REJECTED via a direct SQL
   * UPDATE (see AGENTS.md "Database access" -- other services touch this
   * schema only through the generated Prisma client, api owns it), so the
   * refund itself happens here instead, in the one place already scheduled
   * to reconcile locked tokens against final outcomes. refundedAt makes
   * this idempotent/resumable the same way settledAt does for payouts --
   * a row left REJECTED with refundedAt: null is naturally retried next run.
   */
  private async refundRejectedSubmissions(): Promise<number> {
    const submissions = await this.prisma.submission.findMany({
      where: { status: 'REJECTED', refundedAt: null },
      select: { id: true, userId: true, tokensSpent: true },
    });

    let refundedCount = 0;
    for (const submission of submissions) {
      try {
        // Atomic claim on refundedAt: null before touching tokens -- see the
        // matching comment in refundStuckWordRecordings for why (prevents
        // two overlapping runs from double-refunding the same row).
        const claim = await this.prisma.submission.updateMany({
          where: { id: submission.id, refundedAt: null },
          data: { refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        // Legacy (pre-locking) rows spent balance directly and never locked
        // anything -- nothing to refund, just mark them resolved.
        if (await this.wasLocked(submission.id)) {
          await this.refundTokens(submission.userId, submission.tokensSpent, submission.id);
        }
        refundedCount += 1;
      } catch (err) {
        this.logger.error(
          `Failed to refund rejected submission=${submission.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return refundedCount;
  }

  /**
   * An ENGLISH_TO_DIALECT WordRecording only scores once a peer's
   * DIALECT_TO_ENGLISH reverse-validation lands (see WordsService.
   * scoreReverseValidatedSource) -- if that never happens it stays PENDING
   * forever by design (avoids punishing a correct translation for someone
   * else's bad transcription), so its lock needs its own release path
   * rather than waiting on a SCORED transition that may never come.
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
          data: { refundedAt: new Date() },
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
   * A task still unscored (Submission PENDING/TRANSCRIBED, or WordRecording
   * PENDING outside the ENGLISH_TO_DIALECT stuck-timeout path already
   * covered by refundStuckWordRecordings) past scoringSlaMinutes needs some
   * resolution -- otherwise its lock sits forever waiting on a
   * consensus/reverse-validation outcome that may never land. When
   * noFailOnTrainEnabled is off, this is a plain refund (same shape as
   * refundRejectedSubmissions/refundStuckWordRecordings -- stake back, no
   * bonus). When on, the trainer did complete and submit real work, so
   * instead of a bare refund it's given a synthetic score drawn uniformly
   * from [minScoreRange, maxScoreRange] and moved to SCORED (not straight to
   * SETTLED) -- this hands it to the normal settleSubmissions/
   * settleWordRecordings pass above, so it still waits out
   * settlementDelayMinutes like every other scored row instead of paying out
   * in the same instant it's scored.
   */
  private async resolveTimedOutScoring() {
    const [slaMinutes, noFailEnabled, scoreRange] = await Promise.all([
      this.getScoringSlaMinutes(),
      this.isNoFailOnTrainEnabled(),
      this.getScoreRange(),
    ]);
    const cutoff = new Date(Date.now() - slaMinutes * 60 * 1000);

    const [timedOutSubmissions, timedOutRecordings] = await Promise.all([
      this.prisma.submission.findMany({
        where: {
          status: { in: ['PENDING', 'TRANSCRIBED'] },
          refundedAt: null,
          createdAt: { lt: cutoff },
        },
        select: { id: true, userId: true, tokensSpent: true },
      }),
      this.prisma.wordRecording.findMany({
        where: {
          status: 'PENDING',
          refundedAt: null,
          userId: { not: null },
          createdAt: { lt: cutoff },
        },
        select: { id: true, userId: true, tokensSpent: true },
      }),
    ]);

    let scoredCount = 0;
    let refundedCount = 0;

    for (const submission of timedOutSubmissions) {
      try {
        // Atomic claim, guarded on the same status this row was read with --
        // this is the hard handoff point: once claimed, ASR/consensus-scorer's
        // own status-guarded writes (see whisper-worker/vosk-worker db.py and
        // ConsensusService.scoreCluster) can no longer touch this row, even if
        // a transcription/scoring job for it is mid-flight right now. If a
        // concurrent settlement-job run already claimed it first, count is 0
        // and this run skips it -- no double refund/payout.
        const claim = await this.prisma.submission.updateMany({
          where: {
            id: submission.id,
            status: { in: ['PENDING', 'TRANSCRIBED'] },
            refundedAt: null,
          },
          data: { status: 'EXPIRED', refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        if (noFailEnabled) {
          await this.scoreWithSyntheticScore('submission', submission.id, scoreRange);
          scoredCount += 1;
        } else {
          await this.refundTokens(submission.userId, submission.tokensSpent, submission.id);
          refundedCount += 1;
        }
      } catch (err) {
        this.logger.error(
          `Failed to resolve timed-out submission=${submission.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const recording of timedOutRecordings) {
      if (recording.userId === null) continue;
      try {
        // Same atomic claim as above, for the WordRecording pipeline.
        const claim = await this.prisma.wordRecording.updateMany({
          where: { id: recording.id, status: 'PENDING', refundedAt: null },
          data: { status: 'EXPIRED', refundedAt: new Date() },
        });
        if (claim.count === 0) continue;

        if (noFailEnabled) {
          await this.scoreWithSyntheticScore('wordRecording', recording.id, scoreRange);
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
   * That happens later, in settleSubmissions/settleWordRecordings, once
   * settlementDelayMinutes has elapsed since this scoredAt -- the same path
   * every real consensus/exact-match score goes through. See
   * resolveTimedOutScoring's doc comment for why this was split out of what
   * used to be a single score+settle step.
   */
  private async scoreWithSyntheticScore(
    kind: 'submission' | 'wordRecording',
    id: string,
    scoreRange: { min: number; max: number },
  ): Promise<void> {
    const score = randomInRange(scoreRange.min, scoreRange.max);
    if (kind === 'submission') {
      await this.prisma.submission.update({
        where: { id },
        data: { rawScore: score, score, status: 'SCORED', scoredAt: new Date() },
      });
    } else {
      await this.prisma.wordRecording.update({
        where: { id },
        data: { rawScore: score, score, status: 'SCORED', scoredAt: new Date() },
      });
    }
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

  private async getTokenUsdRate(): Promise<number> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    if (row.tokenUsdRate) {
      return row.tokenUsdRate.toNumber();
    }
    const raw = process.env.TOKEN_USD_RATE ?? '0.10';
    const rate = Number(raw);
    return Number.isFinite(rate) && rate > 0 ? rate : 0.1;
  }

  /**
   * Informational only -- logged for admin visibility, never gates a
   * payout. The no-loss guarantee is unconditional; this can legitimately
   * go negative, which is itself the signal that more subscription pools
   * need opening.
   */
  private async getRewardPoolAvailableTokens(): Promise<number> {
    const [activeAgg, settledSubmissionAgg, settledWordAgg, rate] = await Promise.all([
      this.prisma.subscriptionPool.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { usdAmount: true },
      }),
      this.prisma.submission.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.prisma.wordRecording.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.getTokenUsdRate(),
    ]);

    const totalAvailableUsd = Number(activeAgg._sum.usdAmount ?? 0);
    const totalSettled =
      Number(settledSubmissionAgg._sum.payoutTokenAmount ?? 0) +
      Number(settledWordAgg._sum.payoutTokenAmount ?? 0);
    return totalAvailableUsd / rate - totalSettled;
  }
}
