import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  LedgerEntryType,
  ReserveDirection,
  ReserveTransactionStatus,
  ReserveTransactionType,
} from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecoveryResult {
  poolsReversed: number;
  /** DL actually clawed back from contributors who still held it. */
  recoveredDl: string;
  /** DL written off because the contributor had already withdrawn it. */
  shortfallDl: string;
  contributorsAffected: number;
}

interface ReversiblePool {
  id: string;
  collectedUsd: Prisma.Decimal;
  accruals: { contributorId: string; amountDl: Prisma.Decimal }[];
}

/**
 * Recovers royalties from a settled pool whose payment was later reversed.
 *
 * The situation: a subscriber charges back or is refunded after their royalties
 * are already accrued and possibly already withdrawn. The money is gone from
 * the platform; the DL is not.
 *
 * **Recovery stops at zero.** It takes whatever royalty balance the contributor
 * still holds and goes no further. Three things must NOT happen, in the order
 * they are tempting (docs/Stream-Revenue-Sharing-Engine.md 5.5):
 *
 * - **No negative balance.** A contributor is never driven below zero, so their
 *   dashboard never shows a debt they had no part in creating.
 * - **No debt carried forward.** The shortfall is written off, not deducted from
 *   future royalties. Otherwise a contributor's next months silently disappear
 *   paying off a stranger's chargeback, with no way to see why.
 * - **No reaching into `balance`.** Recovery never touches DL earned by
 *   contributing. The separation holds in BOTH directions -- it is not only
 *   about spendability.
 *
 * **Why the platform eats the shortfall.** The contributor did nothing wrong:
 * they recorded, someone licensed it, someone streamed it, and a party they
 * cannot see and never transacted with reversed a payment. Chargeback risk
 * belongs to whoever chose to accept the card. Exposure is bounded at the
 * contributor share of a single payment.
 *
 * **The reserve is reversed for the FULL amount regardless.** Reversing only
 * what was recovered would leave DL outstanding against revenue that went away,
 * which is exactly the dilution the reserve exists to prevent. The shortfall is
 * a platform loss recorded honestly, not an accounting gap.
 */
@Injectable()
export class RoyaltyRecoveryService {
  private readonly logger = new Logger(RoyaltyRecoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reverse every settled pool whose payment has since been refunded.
   *
   * Driven by `SubscriptionPayment.refundedAt`, which Phase 2's
   * `charge.refunded` / `charge.dispute.created` handlers stamp. Safe to re-run:
   * a pool is only reversed once, enforced by the ledger's unique constraint on
   * (walletId, type, reference).
   */
  async recoverReversedPayments(): Promise<RecoveryResult> {
    const pools = await this.reversedPools();
    if (pools.length === 0) {
      return {
        poolsReversed: 0,
        recoveredDl: '0',
        shortfallDl: '0',
        contributorsAffected: 0,
      };
    }

    let poolsReversed = 0;
    let recovered = new Prisma.Decimal(0);
    let shortfall = new Prisma.Decimal(0);
    let contributorsAffected = 0;

    for (const pool of pools) {
      const outcome = await this.reversePool(pool);
      if (!outcome) continue;
      poolsReversed += 1;
      recovered = recovered.plus(outcome.recovered);
      shortfall = shortfall.plus(outcome.shortfall);
      contributorsAffected += outcome.contributors;
    }

    if (shortfall.greaterThan(0)) {
      // A real platform loss. Logged at warn so it is visible rather than
      // buried in a success line -- someone should know the platform absorbed
      // DL that had already been withdrawn.
      this.logger.warn(
        `Royalty recovery absorbed a shortfall of ${shortfall.toString()} DL across ${poolsReversed} reversed pools -- already withdrawn by contributors and written off, per 5.5`,
      );
    }
    this.logger.log(
      `Royalty recovery: ${poolsReversed} pools reversed, ${recovered.toString()} DL recovered, ${shortfall.toString()} DL absorbed, ${contributorsAffected} contributors affected`,
    );

    return {
      poolsReversed,
      recoveredDl: recovered.toString(),
      shortfallDl: shortfall.toString(),
      contributorsAffected,
    };
  }

  /**
   * Settled pools whose payment was refunded and which have not been reversed.
   *
   * "Not yet reversed" is decided by the absence of the pool's REVERSAL reserve
   * transaction, not by its ledger rows. That distinction matters: a pool whose
   * contributors had already withdrawn everything recovers nothing and therefore
   * writes NO ledger rows, so a ledger-based check would keep reselecting it
   * forever. The reserve reversal is written exactly once per pool regardless of
   * how much was recovered, which makes it the honest completion marker.
   *
   * A column on the pool would be the third option and is deliberately avoided:
   * a boolean that can disagree with the reserve ledger creates two answers to
   * one question.
   */
  private async reversedPools(): Promise<ReversiblePool[]> {
    const pools = await this.prisma.royaltyPool.findMany({
      where: {
        settledAt: { not: null },
        payment: { refundedAt: { not: null } },
      },
      select: {
        id: true,
        collectedUsd: true,
        accruals: { select: { contributorId: true, amountDl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (pools.length === 0) return [];

    const alreadyReversed = await this.prisma.reserveTransaction.findMany({
      where: {
        idempotencyKey: { in: pools.map((pool) => `royalty-pool-reversal:${pool.id}`) },
      },
      select: { sourceReference: true },
    });
    const done = new Set(alreadyReversed.map((row) => row.sourceReference));
    return pools.filter((pool) => !done.has(pool.id));
  }

  /**
   * Reverse one pool, in one transaction.
   *
   * Per contributor: recover `min(owed, balance they still hold)`, write it as a
   * negative ROYALTY_ADJUSTMENT, and write off the rest. The clamp is what keeps
   * a balance from going negative, and it is done with an atomic guarded
   * `updateMany` rather than read-then-write, so a concurrent withdrawal cannot
   * slip between the check and the debit and drive the balance below zero.
   */
  private async reversePool(pool: ReversiblePool): Promise<{
    recovered: Prisma.Decimal;
    shortfall: Prisma.Decimal;
    contributors: number;
  } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        let recovered = new Prisma.Decimal(0);
        let shortfall = new Prisma.Decimal(0);
        let contributors = 0;

        for (const accrual of pool.accruals) {
          const owed = accrual.amountDl;
          if (owed.lessThanOrEqualTo(0)) continue;

          const wallet = await tx.wallet.findUnique({
            where: { userId: accrual.contributorId },
            select: { id: true, royaltyBalance: true },
          });
          if (!wallet) {
            // No wallet means nothing was ever credited here. The whole amount
            // is a write-off rather than an error.
            shortfall = shortfall.plus(owed);
            continue;
          }

          // Stops at zero, always. Never negative, never carried forward, and
          // never reaching into Wallet.balance.
          const take = owed.greaterThan(wallet.royaltyBalance)
            ? wallet.royaltyBalance
            : owed;
          const missed = owed.minus(take);

          if (take.greaterThan(0)) {
            // Atomic guard, matching the wallet ledger's discipline: the debit
            // only applies if the balance still covers it.
            const debit = await tx.wallet.updateMany({
              where: { id: wallet.id, royaltyBalance: { gte: take } },
              data: { royaltyBalance: { decrement: take } },
            });
            if (debit.count === 0) {
              // A concurrent withdrawal drained it first. Nothing recovered
              // from this contributor; the whole amount is absorbed.
              shortfall = shortfall.plus(owed);
              contributors += 1;
              continue;
            }
            await tx.ledgerEntry.create({
              data: {
                walletId: wallet.id,
                type: LedgerEntryType.ROYALTY_ADJUSTMENT,
                // Negative: this is a compensating reversal, not a payment.
                amount: take.neg(),
                reference: pool.id,
              },
            });
            recovered = recovered.plus(take);
          }
          // Deliberately NO ledger row when nothing could be taken. A
          // zero-amount entry would assert that money moved when none did, and
          // the ledger is the source of truth for exactly that. The write-off
          // is visible in this run's shortfall figure and its warn log, which
          // is where a loss the platform absorbed belongs -- not as a phantom
          // balance change on the contributor's own statement.
          if (missed.greaterThan(0)) shortfall = shortfall.plus(missed);
          contributors += 1;
        }

        // The reserve comes off for the FULL reversed amount, not just what was
        // recovered. Reversing only the recovered part would leave DL
        // outstanding against revenue that no longer exists.
        await this.reverseReserveInflow(tx, pool);

        return { recovered, shortfall, contributors };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn(`Pool ${pool.id} was already reversed; skipped`);
        return null;
      }
      throw error;
    }
  }

  /** Debit the reserve for the full reversed revenue, once per pool. */
  private async reverseReserveInflow(
    tx: Prisma.TransactionClient,
    pool: ReversiblePool,
  ): Promise<void> {
    const reserveAccount = await tx.reserveAccount.upsert({
      where: { provider_asset_network: { provider: 'stripe', asset: 'USD', network: '' } },
      update: {},
      create: { provider: 'stripe', asset: 'USD', network: '', currency: 'USD' },
    });
    const idempotencyKey = `royalty-pool-reversal:${pool.id}`;
    await tx.reserveTransaction.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        reserveAccountId: reserveAccount.id,
        type: ReserveTransactionType.REVERSAL,
        status: ReserveTransactionStatus.ELIGIBLE,
        direction: ReserveDirection.DEBIT,
        amount: pool.collectedUsd,
        eligibleUsdAmount: pool.collectedUsd,
        normalizationRate: new Prisma.Decimal(1),
        sourceReference: pool.id,
        idempotencyKey,
        reason: 'Voice Stream subscription payment reversed after royalty settlement',
        settledAt: new Date(),
      },
    });
  }
}
