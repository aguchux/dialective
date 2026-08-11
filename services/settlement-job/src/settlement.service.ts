import { Injectable, Logger } from '@nestjs/common';
import { computeTrainingPayout, creditTrainingPayoutOps, Prisma } from '@dialectiva/db';
import { PrismaService } from './prisma/prisma.service';

/** Uniform random draw in [min, max] -- a payout-fairness randomizer, not a security value, so Math.random() is fine. */
function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
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

    const submissionResult = await this.settleSubmissions(bonusCapMultiple);
    const wordRecordingResult = await this.settleWordRecordings(bonusCapMultiple);
    const rejectedRefundCount = await this.refundRejectedSubmissions();
    const stuckRefundCount = await this.refundStuckWordRecordings();
    const timeoutResult = await this.resolveTimedOutScoring(bonusCapMultiple);

    const settledCount = submissionResult.settledCount + wordRecordingResult.settledCount + timeoutResult.settledCount;
    const eligibleCount = submissionResult.eligibleCount + wordRecordingResult.eligibleCount;
    const totalPayout = submissionResult.totalPayout + wordRecordingResult.totalPayout + timeoutResult.totalPayout;

    if (rejectedRefundCount > 0 || stuckRefundCount > 0 || timeoutResult.refundedCount > 0) {
      this.logger.log(
        `Refunded locked tokens: rejected=${rejectedRefundCount} stuckWordRecordings=${stuckRefundCount} ` +
          `scoringTimeout=${timeoutResult.refundedCount}`,
      );
    }
    if (timeoutResult.settledCount > 0) {
      this.logger.log(`Synthetic-scored ${timeoutResult.settledCount} timed-out task(s) via noFailOnTrain`);
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

  private async settleSubmissions(bonusCapMultiple: number) {
    const submissions = await this.prisma.submission.findMany({
      where: { status: 'SCORED', settledAt: null },
      select: { id: true, userId: true, tokensSpent: true, score: true },
    });

    let settledCount = 0;
    let totalPayout = 0;

    for (const submission of submissions) {
      if (submission.score === null) {
        this.logger.warn(`Skipping submission=${submission.id}: status SCORED but score is null`);
        continue;
      }

      try {
        const payout = computeTrainingPayout(submission.tokensSpent, submission.score, bonusCapMultiple);
        const { ops } = await creditTrainingPayoutOps(this.prisma, submission.userId, payout, submission.id);

        // Release the lock taken at submit time in the same transaction as
        // the payout credit -- no window where tokensSpent is neither
        // locked nor spendable. The lock is replaced, not "returned then
        // re-spent": the payout (stake + bonus) lands fresh in balance.
        await this.prisma.$transaction([
          this.prisma.wallet.updateMany({
            where: { userId: submission.userId },
            data: { lockedBalance: { decrement: submission.tokensSpent } },
          }),
          ...ops,
          this.prisma.submission.update({
            where: { id: submission.id },
            data: { payoutTokenAmount: payout, settledAt: new Date() },
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
  private async settleWordRecordings(bonusCapMultiple: number) {
    const recordings = await this.prisma.wordRecording.findMany({
      where: { status: 'SCORED', settledAt: null, userId: { not: null } },
      select: { id: true, userId: true, tokensSpent: true, score: true },
    });

    let settledCount = 0;
    let totalPayout = 0;

    for (const recording of recordings) {
      if (recording.score === null || recording.userId === null) {
        this.logger.warn(`Skipping wordRecording=${recording.id}: status SCORED but score/userId missing`);
        continue;
      }

      try {
        const payout = computeTrainingPayout(recording.tokensSpent, recording.score, bonusCapMultiple);
        const { ops } = await creditTrainingPayoutOps(this.prisma, recording.userId, payout, recording.id);

        // Same lock-release-alongside-payout pattern as settleSubmissions.
        await this.prisma.$transaction([
          this.prisma.wallet.updateMany({
            where: { userId: recording.userId },
            data: { lockedBalance: { decrement: recording.tokensSpent } },
          }),
          ...ops,
          this.prisma.wordRecording.update({
            where: { id: recording.id },
            data: { payoutTokenAmount: payout, settledAt: new Date() },
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
        await this.prisma.$transaction([
          this.prisma.wallet.updateMany({
            where: { userId: submission.userId },
            data: { lockedBalance: { decrement: submission.tokensSpent }, balance: { increment: submission.tokensSpent } },
          }),
          this.prisma.ledgerEntry.create({
            data: {
              walletId: (await this.getOrCreateWallet(submission.userId)).id,
              type: 'TASK_REFUND',
              amount: submission.tokensSpent,
              reference: submission.id,
            },
          }),
          this.prisma.submission.update({
            where: { id: submission.id },
            data: { refundedAt: new Date() },
          }),
        ]);
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
        await this.prisma.$transaction([
          this.prisma.wallet.updateMany({
            where: { userId: recording.userId },
            data: { lockedBalance: { decrement: recording.tokensSpent }, balance: { increment: recording.tokensSpent } },
          }),
          this.prisma.ledgerEntry.create({
            data: {
              walletId: (await this.getOrCreateWallet(recording.userId)).id,
              type: 'TASK_REFUND',
              amount: recording.tokensSpent,
              reference: recording.id,
            },
          }),
          this.prisma.wordRecording.update({
            where: { id: recording.id },
            data: { refundedAt: new Date() },
          }),
        ]);
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
   * instead of a bare refund they're paid via the *same* no-loss formula
   * every other scored task uses (computeTrainingPayout, same
   * bonusCapMultiple), fed a synthetic score drawn uniformly from
   * [minScoreRange, maxScoreRange] -- this guarantees payment without
   * requiring a real consensus/exact-match/reverse-validation result.
   */
  private async resolveTimedOutScoring(bonusCapMultiple: number) {
    const [slaMinutes, noFailEnabled, scoreRange] = await Promise.all([
      this.getScoringSlaMinutes(),
      this.isNoFailOnTrainEnabled(),
      this.getScoreRange(),
    ]);
    const cutoff = new Date(Date.now() - slaMinutes * 60 * 1000);

    const [timedOutSubmissions, timedOutRecordings] = await Promise.all([
      this.prisma.submission.findMany({
        where: { status: { in: ['PENDING', 'TRANSCRIBED'] }, refundedAt: null, createdAt: { lt: cutoff } },
        select: { id: true, userId: true, tokensSpent: true },
      }),
      this.prisma.wordRecording.findMany({
        where: { status: 'PENDING', refundedAt: null, userId: { not: null }, createdAt: { lt: cutoff } },
        select: { id: true, userId: true, tokensSpent: true },
      }),
    ]);

    let settledCount = 0;
    let refundedCount = 0;
    let totalPayout = 0;

    for (const submission of timedOutSubmissions) {
      try {
        if (noFailEnabled) {
          const payout = await this.settleWithSyntheticScore(
            'submission',
            submission.id,
            submission.userId,
            submission.tokensSpent,
            scoreRange,
            bonusCapMultiple,
          );
          settledCount += 1;
          totalPayout += payout;
        } else {
          await this.refundTokens(submission.userId, submission.tokensSpent, submission.id);
          await this.prisma.submission.update({ where: { id: submission.id }, data: { refundedAt: new Date() } });
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
        if (noFailEnabled) {
          const payout = await this.settleWithSyntheticScore(
            'wordRecording',
            recording.id,
            recording.userId,
            recording.tokensSpent,
            scoreRange,
            bonusCapMultiple,
          );
          settledCount += 1;
          totalPayout += payout;
        } else {
          await this.refundTokens(recording.userId, recording.tokensSpent, recording.id);
          await this.prisma.wordRecording.update({ where: { id: recording.id }, data: { refundedAt: new Date() } });
          refundedCount += 1;
        }
      } catch (err) {
        this.logger.error(
          `Failed to resolve timed-out wordRecording=${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { settledCount, refundedCount, totalPayout };
  }

  private async settleWithSyntheticScore(
    kind: 'submission' | 'wordRecording',
    id: string,
    userId: string,
    tokensSpent: Prisma.Decimal,
    scoreRange: { min: number; max: number },
    bonusCapMultiple: number,
  ): Promise<number> {
    const score = randomInRange(scoreRange.min, scoreRange.max);
    const payout = computeTrainingPayout(tokensSpent, score, bonusCapMultiple);
    const { ops } = await creditTrainingPayoutOps(this.prisma, userId, payout, id);

    const modelUpdate =
      kind === 'submission'
        ? this.prisma.submission.update({
            where: { id },
            data: { score, status: 'SETTLED', scoredAt: new Date(), payoutTokenAmount: payout, settledAt: new Date() },
          })
        : this.prisma.wordRecording.update({
            where: { id },
            data: { score, status: 'SETTLED', scoredAt: new Date(), payoutTokenAmount: payout, settledAt: new Date() },
          });

    await this.prisma.$transaction([
      this.prisma.wallet.updateMany({ where: { userId }, data: { lockedBalance: { decrement: tokensSpent } } }),
      ...ops,
      modelUpdate,
    ]);

    return payout.toNumber();
  }

  private async refundTokens(userId: string, tokensSpent: Prisma.Decimal, reference: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.wallet.updateMany({
        where: { userId },
        data: { lockedBalance: { decrement: tokensSpent }, balance: { increment: tokensSpent } },
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

  private async getScoreRange(): Promise<{ min: number; max: number }> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return { min: row.minScoreRange.toNumber(), max: row.maxScoreRange.toNumber() };
  }

  private async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { userId } });
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
      Number(settledSubmissionAgg._sum.payoutTokenAmount ?? 0) + Number(settledWordAgg._sum.payoutTokenAmount ?? 0);
    return totalAvailableUsd / rate - totalSettled;
  }
}
