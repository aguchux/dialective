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
  const { ops, result } = await buildCreditTrainingPayoutOps(prisma, userId, tokenAmount, reference);
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
  const { ops, result } = await buildCreditTrainingPayoutOps(prisma, userId, tokenAmount, reference);
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
  const hasPayoutBonus = user.referredById && settings.payoutBonusEnabled && settings.payoutBonusRate.gt(0);
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

async function getOrCreateWallet(prisma: PrismaClient, userId: string) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }
  return prisma.wallet.create({ data: { userId } });
}
