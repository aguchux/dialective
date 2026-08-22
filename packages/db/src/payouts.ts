import { Prisma, type PrismaClient } from './generated/prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * No-loss training-payout formula (see AGENTS.md "Wallet / token pool" and
 * docs/Dialectiva_Business_Plan.md §5). payout is always >= tokensSpent
 * (the trainer's stake back, unconditionally) plus a bonus that scales
 * linearly with the 0-100 consensus score, capped at bonusCapMultiple x
 * tokensSpent (business plan's "cap the bonus payout per task at a fixed
 * multiple, e.g. max 1x stake" guardrail). This is intentionally
 * independent of Reward Pool availability -- the no-loss guarantee is
 * unconditional, pool balance is a read-only admin signal, never a gate.
 */
export function computeTrainingPayout(
  tokensSpent: Decimal | number | string,
  score: Decimal | number | string,
  bonusCapMultiple: Decimal | number | string,
): Decimal {
  const spent = new Decimal(tokensSpent);
  const scoreFraction = Decimal.max(0, Decimal.min(100, new Decimal(score))).div(100);
  const bonus = spent.mul(scoreFraction).mul(new Decimal(bonusCapMultiple));
  return spent.add(bonus);
}

export interface CreditTrainingPayoutResult {
  userId: string;
  reference: string;
  grossAmount: string;
  netAmount: string;
  referralPayoutBonus: string;
  referrerUserId: string | null;
  distributorReferralBonuses?: ReferralBonusCredit[];
}

export interface ReferralBonusCredit {
  userId: string;
  level: number;
  rate: string;
  amount: string;
}

/**
 * Credits a training payout to a trainer's wallet, deducting and remitting
 * a referral payout bonus to their referrer when applicable -- the exact
 * ledger-entry + wallet-increment logic previously inlined in
 * WalletController.creditTrainingPayout (api's manual admin/training-payouts
 * route), now shared so settlement-job's automated payouts use identical
 * math. Runs its writes in a single $transaction; callers that need this
 * bundled with other writes (e.g. settlement-job marking a Submission
 * settled) should call creditTrainingPayoutOps instead and include the
 * returned operations in their own transaction array.
 */
export async function creditTrainingPayout(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
): Promise<CreditTrainingPayoutResult> {
  const { ops, result } = await buildCreditTrainingPayoutOps(
    prisma,
    userId,
    tokenAmount,
    reference,
  );
  await prisma.$transaction(ops);
  return result;
}

/**
 * Same computation as creditTrainingPayout, but returns the Prisma
 * operations unexecuted so a caller can bundle them into a larger
 * transaction (e.g. settlement-job also marking Submission.settledAt in the
 * same commit).
 */
export async function creditTrainingPayoutOps(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
) {
  const { ops, result } = await buildCreditTrainingPayoutOps(
    prisma,
    userId,
    tokenAmount,
    reference,
  );
  return { ops, result };
}

async function buildCreditTrainingPayoutOps(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
) {
  const userWallet = await getOrCreateWallet(prisma, userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const settings = await prisma.referralSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  const grossAmount = new Decimal(tokenAmount);
  const distributorBonuses = await buildDistributorReferralBonuses(prisma, userId, grossAmount);
  const distributorPayoutTotal = distributorBonuses.reduce(
    (sum, bonus) => sum.add(bonus.amount),
    new Decimal(0),
  );
  if (distributorBonuses.length > 0) {
    // Distributor commissions are platform-funded, not deducted from the
    // trainer -- the trainer's own payout stays exactly grossAmount
    // (unconditional stake-back + score bonus, per the no-loss guarantee
    // documented above). Unlike the legacy single-level REFERRAL_PAYOUT_BONUS
    // below (which predates the no-loss guarantee and is left as-is to avoid
    // changing existing trainer-referral economics), a multi-level
    // distributor chain could otherwise erode a trainer's payout below their
    // stake once several levels are active -- minting the commissions
    // instead of subtracting them keeps the guarantee intact regardless of
    // how many levels or how high the configured rates are.
    const ops = [
      prisma.ledgerEntry.create({
        data: { walletId: userWallet.id, type: 'TRAINING_PAYOUT', amount: grossAmount, reference },
      }),
      prisma.wallet.update({
        where: { id: userWallet.id },
        data: { balance: { increment: grossAmount } },
      }),
      ...distributorBonuses.flatMap((bonus) => [
        prisma.ledgerEntry.create({
          data: {
            walletId: bonus.walletId,
            type: 'DISTRIBUTOR_PAYOUT_BONUS' as const,
            amount: bonus.amount,
            reference: `${reference}:L${bonus.level}`,
          },
        }),
        prisma.wallet.update({
          where: { id: bonus.walletId },
          data: { balance: { increment: bonus.amount } },
        }),
      ]),
    ];

    const result: CreditTrainingPayoutResult = {
      userId,
      reference,
      grossAmount: grossAmount.toString(),
      netAmount: grossAmount.toString(),
      referralPayoutBonus: distributorPayoutTotal.toString(),
      referrerUserId: distributorBonuses[0]?.userId ?? null,
      distributorReferralBonuses: distributorBonuses.map((bonus) => ({
        userId: bonus.userId,
        level: bonus.level,
        rate: bonus.rate.toString(),
        amount: bonus.amount.toString(),
      })),
    };

    return { ops, result };
  }

  const hasPayoutBonus =
    user.referredById && settings.payoutBonusEnabled && settings.payoutBonusRate.gt(0);
  const payoutBonus = hasPayoutBonus ? settings.payoutBonusRate.mul(grossAmount) : null;
  const netAmount = payoutBonus ? grossAmount.sub(payoutBonus) : grossAmount;
  const referrerWallet =
    user.referredById && payoutBonus ? await getOrCreateWallet(prisma, user.referredById) : null;

  const ops = [
    prisma.ledgerEntry.create({
      data: { walletId: userWallet.id, type: 'TRAINING_PAYOUT', amount: netAmount, reference },
    }),
    prisma.wallet.update({
      where: { id: userWallet.id },
      data: { balance: { increment: netAmount } },
    }),
    ...(referrerWallet && payoutBonus
      ? [
          prisma.ledgerEntry.create({
            data: {
              walletId: referrerWallet.id,
              type: 'REFERRAL_PAYOUT_BONUS' as const,
              amount: payoutBonus,
              reference,
            },
          }),
          prisma.wallet.update({
            where: { id: referrerWallet.id },
            data: { balance: { increment: payoutBonus } },
          }),
        ]
      : []),
  ];

  const result: CreditTrainingPayoutResult = {
    userId,
    reference,
    grossAmount: grossAmount.toString(),
    netAmount: netAmount.toString(),
    referralPayoutBonus: payoutBonus?.toString() ?? '0',
    referrerUserId: user.referredById,
  };

  return { ops, result };
}

export interface CreditAdminFundingResult {
  userId: string;
  reference: string;
  amount: string;
}

export interface AdminWalletAdjustmentResult {
  userId: string;
  reference: string;
  amount: string;
  balance: string;
}

/**
 * Credits a manual admin grant to a user's wallet as its own ledger type
 * (ADMIN_FUNDING) -- distinct from TRAINING_PAYOUT (score-based training
 * work) and STARTUP_BONUS (automatic one-time signup credit) so admins can
 * tell the three apart on a wallet's activity feed. Unlike
 * creditTrainingPayout, this never triggers referral/distributor bonus
 * fan-out -- an admin manually funding one account isn't a training-payout
 * or deposit event for referral-bonus purposes.
 */
export async function creditAdminFunding(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
): Promise<CreditAdminFundingResult> {
  const wallet = await getOrCreateWallet(prisma, userId);
  const amount = new Decimal(tokenAmount);
  await prisma.$transaction([
    prisma.ledgerEntry.create({
      data: { walletId: wallet.id, type: 'ADMIN_FUNDING', amount, reference },
    }),
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    }),
  ]);
  return { userId, reference, amount: amount.toString() };
}

/**
 * Signed admin correction against a user's available wallet balance. Positive
 * values credit; negative values debit. This intentionally does not send any
 * user notification and is meant for correcting mistaken credits.
 */
export async function adjustAdminWallet(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
): Promise<AdminWalletAdjustmentResult> {
  const wallet = await getOrCreateWallet(prisma, userId);
  const amount = new Decimal(tokenAmount);
  if (amount.isZero()) {
    throw new Error('Admin wallet adjustment amount must not be zero');
  }

  const result = await prisma.$transaction(async (tx) => {
    if (amount.isNegative()) {
      const debitAmount = amount.abs();
      const claim = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: debitAmount } },
        data: { balance: { decrement: debitAmount } },
      });
      if (claim.count !== 1) {
        throw new Error('Insufficient wallet balance for this debit');
      }
    } else {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });
    }

    await tx.ledgerEntry.create({
      data: { walletId: wallet.id, type: 'ADMIN_ADJUSTMENT', amount, reference },
    });
    const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    return updated.balance;
  });

  return { userId, reference, amount: amount.toString(), balance: result.toString() };
}

/**
 * Credits the one-time startup bonus to a user's wallet as a STARTUP_BONUS
 * ledger entry. This helper is intentionally idempotent at the wallet ledger
 * level so every signup/auth verification path can call it safely.
 */
export async function creditStartupBonus(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
): Promise<void> {
  const wallet = await getOrCreateWallet(prisma, userId);
  const amount = new Decimal(tokenAmount);
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.ledgerEntry.findFirst({
        where: { walletId: wallet.id, type: 'STARTUP_BONUS' },
        select: { id: true },
      });
      if (existing) return;

      await tx.ledgerEntry.create({
        data: { walletId: wallet.id, type: 'STARTUP_BONUS', amount, reference },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return;
    }
    throw err;
  }
}

/**
 * Credits a course's one-time completion reward to a trainer's wallet as a
 * COURSE_COMPLETION_REWARD ledger entry, keyed by courseId as the reference
 * so the LedgerEntry(walletId, type, reference) unique constraint makes this
 * naturally idempotent per (wallet, course) -- same P2002-swallow pattern as
 * creditStartupBonus, just scoped to one course instead of being wallet-wide.
 * Returns true if a credit was actually written, false if this trainer
 * already had one for this course (lets the caller pick "with reward" vs
 * "without reward" completion-email copy without a separate read).
 */
export async function creditCourseCompletionReward(
  prisma: PrismaClient,
  userId: string,
  courseId: string,
  tokenAmount: Decimal | number | string,
): Promise<boolean> {
  const wallet = await getOrCreateWallet(prisma, userId);
  const amount = new Decimal(tokenAmount);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'COURSE_COMPLETION_REWARD',
          amount,
          reference: courseId,
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}

export async function creditFundingReferralBonusesOps(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
) {
  const baseAmount = new Decimal(tokenAmount);
  const distributorBonuses = await buildDistributorReferralBonuses(prisma, userId, baseAmount);
  if (distributorBonuses.length > 0) {
    const ops = distributorBonuses.flatMap((bonus) => [
      prisma.ledgerEntry.create({
        data: {
          walletId: bonus.walletId,
          type: 'DISTRIBUTOR_FUNDING_BONUS' as const,
          amount: bonus.amount,
          reference: `${reference}:L${bonus.level}`,
        },
      }),
      prisma.wallet.update({
        where: { id: bonus.walletId },
        data: { balance: { increment: bonus.amount } },
      }),
    ]);
    return {
      ops,
      entries: distributorBonuses.map((bonus) => ({
        walletId: bonus.walletId,
        type: 'DISTRIBUTOR_FUNDING_BONUS' as const,
        amount: bonus.amount,
        reference: `${reference}:L${bonus.level}`,
      })),
      bonuses: distributorBonuses.map((bonus) => ({
        userId: bonus.userId,
        level: bonus.level,
        rate: bonus.rate.toString(),
        amount: bonus.amount.toString(),
      })),
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const settings = await prisma.referralSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
  if (!user?.referredById || !settings.fundingBonusEnabled || !settings.fundingBonusRate.gt(0)) {
    return { ops: [], entries: [], bonuses: [] };
  }

  const referrerWallet = await getOrCreateWallet(prisma, user.referredById);
  const amount = settings.fundingBonusRate.mul(baseAmount);
  return {
    ops: [
      prisma.ledgerEntry.create({
        data: {
          walletId: referrerWallet.id,
          type: 'REFERRAL_FUNDING_BONUS',
          amount,
          reference,
        },
      }),
      prisma.wallet.update({
        where: { id: referrerWallet.id },
        data: { balance: { increment: amount } },
      }),
    ],
    entries: [
      {
        walletId: referrerWallet.id,
        type: 'REFERRAL_FUNDING_BONUS' as const,
        amount,
        reference,
      },
    ],
    bonuses: [
      {
        userId: user.referredById,
        level: 1,
        rate: settings.fundingBonusRate.toString(),
        amount: amount.toString(),
      },
    ],
  };
}

/**
 * Every entry this returns has rate.gt(0) (filtered at the push site below),
 * and baseAmount is always a positive deposit/payout amount by the time it
 * reaches here -- so bonuses.length > 0 already implies every amount is
 * strictly positive. Both call sites (creditFundingReferralBonusesOps and
 * buildCreditTrainingPayoutOps) key their "did a distributor bonus apply"
 * branch on this array's length alone; don't add a zero-rate/zero-amount
 * entry here without updating both call sites' guards to match.
 */
async function buildDistributorReferralBonuses(
  prisma: PrismaClient,
  userId: string,
  baseAmount: Decimal,
) {
  const settings = await prisma.distributorSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
  if (!settings.enabled || !settings.multiLevelReferralEnabled || settings.maxReferralDepth < 1) {
    return [];
  }

  const rates = [
    settings.level1Rate,
    settings.level2Rate,
    settings.level3Rate,
    settings.level4Rate,
    settings.level5Rate,
  ];
  const maxDepth = Math.min(5, settings.maxReferralDepth);
  const bonuses: Array<{
    userId: string;
    walletId: string;
    level: number;
    rate: Decimal;
    amount: Decimal;
  }> = [];
  let cursor = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });

  for (let level = 1; level <= maxDepth && cursor?.referredById; level += 1) {
    const ancestor = await prisma.user.findUnique({
      where: { id: cursor.referredById },
      select: { id: true, role: true, referredById: true },
    });
    if (!ancestor) break;

    const rate = rates[level - 1] ?? new Decimal(0);
    // ADMIN is deliberately included alongside DISTRIBUTOR here: an admin
    // acting as a house/seed account in a referral chain earns the same
    // per-level commission a distributor would. A plain TRAINER ancestor is
    // skipped (no commission) but the walk still advances past them via
    // cursor below, so a trainer sitting mid-chain doesn't break payouts to
    // a distributor/admin further up.
    if ((ancestor.role === 'DISTRIBUTOR' || ancestor.role === 'ADMIN') && rate.gt(0)) {
      const wallet = await getOrCreateWallet(prisma, ancestor.id);
      bonuses.push({
        userId: ancestor.id,
        walletId: wallet.id,
        level,
        rate,
        amount: baseAmount.mul(rate),
      });
    }

    cursor = { referredById: ancestor.referredById };
  }

  return bonuses;
}

async function getOrCreateWallet(prisma: PrismaClient, userId: string) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }
  try {
    return await prisma.wallet.create({ data: { userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.wallet.findUniqueOrThrow({ where: { userId } });
    }
    throw err;
  }
}
