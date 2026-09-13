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

// "Tokens since join" (lifetime) is genuine new value credited to the
// trainer -- every one-time/recurring reward type, not just the two
// (training/referral) this report breaks out its own totals for. Deliberately
// excludes TASK_REFUND, WITHDRAWAL_REVERSED, PHONE_VERIFICATION_FEE_REFUND,
// and P2P_ESCROW_* -- those are refunds/reversals of the trainer's own prior
// debit, not new earnings, and summing them in here double-counted tokens
// the trainer never actually lost (e.g. a locked-then-refunded task payment
// inflated this total by the refund on top of the original balance it
// restored). Also excludes DEPOSIT/ADMIN_FUNDING/ADMIN_ADJUSTMENT/
// DISTRIBUTOR_* -- those are balance top-ups from an external actor, not
// something the trainer earned through the platform.
export const LIFETIME_CREDIT_ENTRY_TYPES: LedgerEntryType[] = [
  ...EARNING_ENTRY_TYPES,
  LedgerEntryType.STARTUP_BONUS,
  LedgerEntryType.TESTIMONY_APPROVED_REWARD,
  LedgerEntryType.VALIDATION_REWARD,
];

// Real value added to a trainer's balance by someone other than the trainer's
// own platform activity -- an admin top-up, a raw deposit, or a distributor
// allocation. Not "earned" (excluded from LIFETIME_CREDIT_ENTRY_TYPES above),
// but also not a lock/refund hold-and-release with no net effect, so it still
// belongs on trainer-facing screens: this is the other half of "what actually
// added value to my balance besides what I earned." SUB_DISTRIBUTOR_ADJUSTMENT
// is signed (can be negative) and is included as-is, same as ADMIN_ADJUSTMENT.
export const EXTERNAL_TOPUP_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.DEPOSIT,
  LedgerEntryType.ADMIN_FUNDING,
  LedgerEntryType.ADMIN_ADJUSTMENT,
  LedgerEntryType.DISTRIBUTOR_BULK_ALLOCATION,
  LedgerEntryType.DISTRIBUTOR_FUNDING_BONUS,
  LedgerEntryType.DISTRIBUTOR_PAYOUT_BONUS,
  LedgerEntryType.SUB_DISTRIBUTOR_ADJUSTMENT,
];

export interface ProofReportLedgerEntry {
  id: string;
  type: string;
  amount: string;
  reference: string | null;
  createdAt: string;
}

export interface ProofAccountReport {
  userId: string;
  generatedAt: string;
  accountCreatedAt: string;
  summary: {
    totalTokensSinceJoin: string;
    availableBalanceTokens: string;
    heldBalanceTokens: string;
    totalWithdrawnTokens: string;
    totalRecordings: number;
    scoredRecordings: number;
    avgScore: string | null;
  };
  // Every credit/debit type that ever touched this wallet, summed -- lets a
  // reader verify totalTokensSinceJoin/availableBalanceTokens themselves
  // line by line instead of trusting the summary figures alone.
  ledgerTotalsByType: { type: string; totalAmount: string; count: number }[];
  // Full itemized history, oldest first -- the actual proof, not a rollup.
  ledgerEntries: ProofReportLedgerEntry[];
}

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
    // Real value added by an external actor (admin funding/adjustment,
    // deposit, distributor allocation) -- not earned through the platform,
    // but not lock/refund noise either. Shown alongside totalTokensSinceJoin
    // so a trainer can reconcile availableBalanceTokens without needing the
    // raw per-type ledger breakdown (that stays admin-only -- see
    // ProofAccountReport.ledgerTotalsByType).
    otherCreditsTokens: string;
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

  /**
   * The trainer's true lifetime "everything ever earned" figure -- shared by
   * buildReport (below) and wallet.controller.ts's GET wallet/dashboard, so
   * both surfaces show the same number under a "total earned"/"cumulative
   * tokens" label instead of each re-deriving their own (previously
   * wallet/dashboard exposed no lifetime total at all; its Tokens tab
   * approximated one client-side as balance+lockedBalance, which excludes
   * everything already withdrawn or spent -- the opposite of "lifetime").
   */
  async getTotalTokensSinceJoin(userId: string): Promise<number> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) return 0;
    const lifetimeEarningsAgg = await this.prisma.ledgerEntry.aggregate({
      where: { walletId: wallet.id, type: { in: LIFETIME_CREDIT_ENTRY_TYPES } },
      _sum: { amount: true },
    });
    return Number(lifetimeEarningsAgg._sum.amount ?? 0);
  }

  /** Lifetime counterpart to getTotalTokensSinceJoin, for EXTERNAL_TOPUP_ENTRY_TYPES -- see that constant's doc comment. */
  async getOtherCreditsSinceJoin(userId: string): Promise<number> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) return 0;
    const otherCreditsAgg = await this.prisma.ledgerEntry.aggregate({
      where: { walletId: wallet.id, type: { in: EXTERNAL_TOPUP_ENTRY_TYPES } },
      _sum: { amount: true },
    });
    return Number(otherCreditsAgg._sum.amount ?? 0);
  }

  async buildReport(userId: string, from?: Date, to?: Date): Promise<TrainerReport> {
    const effectiveTo = to ?? new Date();
    const effectiveFrom = from ?? (await this.resolveSignupDate(userId));
    const createdAtRange = { gte: effectiveFrom, lte: effectiveTo };

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, lockedBalance: true },
    });

    const [ledgerTotals, ledgerDaily, wordRecordings, lifetimeEarningsAgg, otherCreditsAgg, withdrawnAgg] =
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
        // genuine earning the wallet has ever received, not just earnings
        // within the selected report range. Scoped to
        // LIFETIME_CREDIT_ENTRY_TYPES rather than amount > 0 -- the latter
        // also matched TASK_REFUND/WITHDRAWAL_REVERSED/etc, which return the
        // trainer's own prior debit rather than crediting new value, and
        // inflated this total well past what the trainer actually earned.
        wallet
          ? this.prisma.ledgerEntry.aggregate({
              where: { walletId: wallet.id, type: { in: LIFETIME_CREDIT_ENTRY_TYPES } },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
        // Lifetime (no date filter), same rationale as lifetimeEarningsAgg
        // above but for EXTERNAL_TOPUP_ENTRY_TYPES -- real balance-adding
        // value from an external actor, kept separate from "earned."
        wallet
          ? this.prisma.ledgerEntry.aggregate({
              where: { walletId: wallet.id, type: { in: EXTERNAL_TOPUP_ENTRY_TYPES } },
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
        otherCreditsTokens: Number(otherCreditsAgg._sum.amount ?? 0).toString(),
        availableBalanceTokens: (wallet?.balance.toNumber() ?? 0).toString(),
        heldBalanceTokens: (wallet?.lockedBalance.toNumber() ?? 0).toString(),
        totalWithdrawnTokens: Math.max(totalWithdrawn, 0).toString(),
      },
      daily,
    };
  }

  /**
   * Full lifetime account reconciliation for the "Proof Account" admin CTA
   * (frontend/app/admin/leaderboard) -- unlike buildReport (which windows to
   * a from/to range for the trainer's own on-demand Reports screen), this
   * always covers the account's entire history and includes every single
   * ledger row, not just daily rollups, so an admin can hand a trainer a
   * document that answers "why is my balance not (cumulative - withdrawn)"
   * line by line rather than asserting a total.
   */
  async buildProofAccountReport(userId: string): Promise<ProofAccountReport> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true },
    });
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, lockedBalance: true },
    });

    if (!wallet) {
      return {
        userId,
        generatedAt: new Date().toISOString(),
        accountCreatedAt: user.createdAt.toISOString(),
        summary: {
          totalTokensSinceJoin: '0',
          availableBalanceTokens: '0',
          heldBalanceTokens: '0',
          totalWithdrawnTokens: '0',
          totalRecordings: 0,
          scoredRecordings: 0,
          avgScore: null,
        },
        ledgerTotalsByType: [],
        ledgerEntries: [],
      };
    }

    const [lifetimeEarningsAgg, withdrawnAgg, ledgerByType, ledgerEntries, wordRecordings] =
      await Promise.all([
        this.prisma.ledgerEntry.aggregate({
          where: { walletId: wallet.id, type: { in: LIFETIME_CREDIT_ENTRY_TYPES } },
          _sum: { amount: true },
        }),
        this.prisma.ledgerEntry.aggregate({
          where: {
            walletId: wallet.id,
            type: { in: [LedgerEntryType.WITHDRAWAL, LedgerEntryType.WITHDRAWAL_REVERSED] },
          },
          _sum: { amount: true },
        }),
        this.prisma.ledgerEntry.groupBy({
          by: ['type'],
          where: { walletId: wallet.id },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.ledgerEntry.findMany({
          where: { walletId: wallet.id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, type: true, amount: true, reference: true, createdAt: true },
        }),
        this.prisma.wordRecording.findMany({
          where: { userId },
          select: { score: true },
        }),
      ]);

    const totalWithdrawn = -Number(withdrawnAgg._sum.amount ?? 0);
    const scored = wordRecordings.filter((row) => row.score !== null);
    const avgScore =
      scored.length > 0
        ? (
            scored.reduce((total, row) => total + Number(row.score), 0) / scored.length
          ).toFixed(2)
        : null;

    return {
      userId,
      generatedAt: new Date().toISOString(),
      accountCreatedAt: user.createdAt.toISOString(),
      summary: {
        totalTokensSinceJoin: Number(lifetimeEarningsAgg._sum.amount ?? 0).toString(),
        availableBalanceTokens: wallet.balance.toNumber().toString(),
        heldBalanceTokens: wallet.lockedBalance.toNumber().toString(),
        totalWithdrawnTokens: Math.max(totalWithdrawn, 0).toString(),
        totalRecordings: wordRecordings.length,
        scoredRecordings: scored.length,
        avgScore,
      },
      ledgerTotalsByType: ledgerByType.map((entry) => ({
        type: entry.type,
        totalAmount: Number(entry._sum.amount ?? 0).toString(),
        count: entry._count._all,
      })),
      ledgerEntries: ledgerEntries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount.toString(),
        reference: entry.reference,
        createdAt: entry.createdAt.toISOString(),
      })),
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
