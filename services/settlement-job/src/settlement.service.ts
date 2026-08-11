import { Injectable, Logger } from '@nestjs/common';
import { computeTrainingPayout, creditTrainingPayoutOps } from '@dialectiva/db';
import { PrismaService } from './prisma/prisma.service';

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

    const settledCount = submissionResult.settledCount + wordRecordingResult.settledCount;
    const eligibleCount = submissionResult.eligibleCount + wordRecordingResult.eligibleCount;
    const totalPayout = submissionResult.totalPayout + wordRecordingResult.totalPayout;

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

        await this.prisma.$transaction([
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

        await this.prisma.$transaction([
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
