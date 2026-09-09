import { Injectable } from '@nestjs/common';
import { LedgerEntryType } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';

const EARNING_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.TRAINING_PAYOUT,
  LedgerEntryType.COURSE_COMPLETION_REWARD,
  LedgerEntryType.REFERRAL_COMMISSION,
  LedgerEntryType.REFERRAL_FUNDING_BONUS,
  LedgerEntryType.REFERRAL_PAYOUT_BONUS,
];

export interface TrainerReport {
  from: string;
  to: string;
  totals: {
    recordings: number;
    scoredRecordings: number;
    avgScore: string | null;
    avgCompositeScore: string | null;
    trainingEarningsTokens: string;
    referralEarningsTokens: string;
    totalEarningsTokens: string;
    // Account-flow figures below are always lifetime (since the trainer
    // joined), regardless of the report's from/to range -- "available
    // balance" or "total withdrawn" scoped to an arbitrary date window
    // wouldn't mean anything a trainer could act on; these answer "where do
    // I stand right now" alongside the range-scoped recording/earnings
    // figures above.
    totalTokensSinceJoin: string;
    availableBalanceTokens: string;
    heldBalanceTokens: string;
    totalWithdrawnTokens: string;
  };
  daily: { date: string; recordings: number; earningsTokens: string }[];
}

/**
 * Single source of truth for a trainer's recordings/earnings/scores report,
 * shared by wallet.controller.ts's GET wallet/report (on-demand, any date
 * range) and weekly-trainer-report.ts (the Monday cron, always trailing 7
 * days) -- both just call buildReport with different from/to, avoiding two
 * copies of this aggregation.
 */
@Injectable()
export class TrainerReportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildReport(userId: string, from?: Date, to?: Date): Promise<TrainerReport> {
    const effectiveTo = to ?? new Date();
    const effectiveFrom = from ?? (await this.resolveSignupDate(userId));
    const createdAtRange = { gte: effectiveFrom, lte: effectiveTo };

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, lockedBalance: true },
    });

    const [ledgerTotals, ledgerDaily, wordRecordings, lifetimeEarningsAgg, withdrawnAgg] =
      await Promise.all([
        wallet
          ? this.prisma.ledgerEntry.groupBy({
              by: ['type'],
              where: {
                walletId: wallet.id,
                type: { in: EARNING_ENTRY_TYPES },
                createdAt: createdAtRange,
              },
              _sum: { amount: true },
            })
          : Promise.resolve([]),
        wallet
          ? this.prisma.ledgerEntry.findMany({
              where: { walletId: wallet.id, type: { in: EARNING_ENTRY_TYPES }, createdAt: createdAtRange },
              select: { amount: true, createdAt: true },
            })
          : Promise.resolve([]),
        this.prisma.wordRecording.findMany({
          where: { userId, createdAt: createdAtRange },
          select: { score: true, compositeScore: true, createdAt: true },
        }),
        // Lifetime (no date filter) -- "total tokens since join" sums every
        // credit the wallet has ever received, not just earnings within the
        // selected report range.
        wallet
          ? this.prisma.ledgerEntry.aggregate({
              where: { walletId: wallet.id, amount: { gt: 0 } },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
        // WITHDRAWAL_REVERSED is a signed reversal of a prior WITHDRAWAL
        // (see LedgerEntryType's schema doc comment) -- summing both types
        // together nets a reversed withdrawal back out automatically,
        // rather than needing a separate subtraction step.
        wallet
          ? this.prisma.ledgerEntry.aggregate({
              where: {
                walletId: wallet.id,
                type: { in: [LedgerEntryType.WITHDRAWAL, LedgerEntryType.WITHDRAWAL_REVERSED] },
              },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
      ]);

    const earningsAmount = (types: LedgerEntryType[]) =>
      ledgerTotals
        .filter((entry) => types.includes(entry.type))
        .reduce((total, entry) => total + Number(entry._sum.amount ?? 0), 0);
    // Course completion bonuses fold into the "training earnings" bucket
    // rather than getting their own field -- they're trainer-earned income
    // like a training payout, just triggered by finishing a course instead
    // of a recording.
    const trainingEarnings = earningsAmount([
      LedgerEntryType.TRAINING_PAYOUT,
      LedgerEntryType.COURSE_COMPLETION_REWARD,
    ]);
    const referralEarnings = earningsAmount([
      LedgerEntryType.REFERRAL_COMMISSION,
      LedgerEntryType.REFERRAL_FUNDING_BONUS,
      LedgerEntryType.REFERRAL_PAYOUT_BONUS,
    ]);

    const allRecordings = wordRecordings;
    const scored = allRecordings.filter((row) => row.score !== null);
    const withComposite = allRecordings.filter((row) => row.compositeScore !== null);
    const avgOf = (values: number[]): string | null =>
      values.length > 0
        ? (values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)
        : null;

    const daily = this.buildDailyBuckets(effectiveFrom, effectiveTo, ledgerDaily, allRecordings);

    // WITHDRAWAL rows are stored negative (a debit); WITHDRAWAL_REVERSED
    // nets a reversed one back out. Negate the signed sum so "total
    // withdrawn" reads as a positive figure like every other total here.
    const totalWithdrawn = -Number(withdrawnAgg._sum.amount ?? 0);

    return {
      from: effectiveFrom.toISOString(),
      to: effectiveTo.toISOString(),
      totals: {
        recordings: allRecordings.length,
        scoredRecordings: scored.length,
        avgScore: avgOf(scored.map((row) => Number(row.score))),
        avgCompositeScore: avgOf(withComposite.map((row) => Number(row.compositeScore))),
        trainingEarningsTokens: trainingEarnings.toString(),
        referralEarningsTokens: referralEarnings.toString(),
        totalEarningsTokens: (trainingEarnings + referralEarnings).toString(),
        totalTokensSinceJoin: Number(lifetimeEarningsAgg._sum.amount ?? 0).toString(),
        availableBalanceTokens: (wallet?.balance.toNumber() ?? 0).toString(),
        heldBalanceTokens: (wallet?.lockedBalance.toNumber() ?? 0).toString(),
        totalWithdrawnTokens: Math.max(totalWithdrawn, 0).toString(),
      },
      daily,
    };
  }

  private async resolveSignupDate(userId: string): Promise<Date> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true },
    });
    return user.createdAt;
  }

  /** Pre-seeds every day in [from, to] with 0 (same "empty days still show" convention as wallet.controller.ts's getEarningsChart), then fills in real activity. */
  private buildDailyBuckets(
    from: Date,
    to: Date,
    ledgerDaily: { amount: unknown; createdAt: Date }[],
    recordings: { createdAt: Date }[],
  ): { date: string; recordings: number; earningsTokens: string }[] {
    const buckets = new Map<string, { recordings: number; earningsTokens: number }>();
    const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    for (
      let day = new Date(startDay);
      day.getTime() <= endDay.getTime();
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      buckets.set(day.toISOString().slice(0, 10), { recordings: 0, earningsTokens: 0 });
    }

    for (const entry of ledgerDaily) {
      const key = entry.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) bucket.earningsTokens += Number(entry.amount);
    }
    for (const recording of recordings) {
      const key = recording.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) bucket.recordings += 1;
    }

    return Array.from(buckets, ([date, bucket]) => ({
      date,
      recordings: bucket.recordings,
      earningsTokens: bucket.earningsTokens.toString(),
    }));
  }
}
