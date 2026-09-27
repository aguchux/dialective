import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  LedgerEntryType,
  ReserveDirection,
  ReserveTransactionStatus,
  ReserveTransactionType,
} from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { TokenomicsService } from '../../tokenomics/tokenomics.service';

/** Why a run refused to settle at all. Nothing is settled when set. */
export type SettlementAbortReason =
  | 'royalties_disabled'
  | 'shadow_mode'
  | 'minting_paused'
  | 'run_cap_exceeded';

export interface SettlementResult {
  periodStart: Date;
  poolsSettled: number;
  contributorsCredited: number;
  totalAccruedDl: string;
  /** Set when the whole run was refused. poolsSettled is then 0. */
  abortedBecause?: SettlementAbortReason;
  /** Pools that lost the claim race to a concurrent run. */
  alreadySettled: number;
}

/** A pool ready to settle, with its accruals. */
interface SettleablePool {
  id: string;
  organizationId: string;
  collectedUsd: Prisma.Decimal;
  poolDl: Prisma.Decimal;
  accruals: { contributorId: string; amountDl: Prisma.Decimal }[];
}

/**
 * Settles shadow-mode royalty pools: credits `royaltyBalance`, writes the
 * ledger, and records the revenue as a reserve inflow.
 *
 * THE ONLY PLACE IN THIS ENGINE THAT MOVES MONEY. Four things make that
 * defensible:
 *
 * 1. **The pool is claimed before any write.** `updateMany` on
 *    `{ id, settledAt: null }`, and `count === 0` aborts that pool. This is the
 *    whole idempotency story and the highest-risk line here -- it follows
 *    `claimTradeOutOfPlay` in p2p.service.ts, the repo's existing
 *    single-serialization-point pattern.
 *
 * 2. **Every gate is checked before the loop, not inside it.** `royaltiesEnabled`,
 *    shadow mode, `mintingPaused` and the per-run cap all refuse the entire run.
 *    A run that settles half its pools and then trips a limit is far worse than
 *    one that settles none, because the half that moved cannot be un-moved.
 *
 * 3. **Credits `royaltyBalance`, never `balance`.** The separation Phase 5
 *    exists to create: royalty DL funds withdrawals only, never a task stake or
 *    P2P escrow.
 *
 * 4. **It records the reserve inflow but does NOT mint.** See the note on
 *    `settlePool` -- this is a deliberate, reviewed departure from section 5.3.
 */
@Injectable()
export class RoyaltySettlementService {
  private readonly logger = new Logger(RoyaltySettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly tokenomics: TokenomicsService,
  ) {}

  /**
   * Settle every unsettled pool for a period.
   *
   * Takes an explicit period so an operator settles a period they have looked
   * at, rather than whatever the clock implies. A pool is only ever settled
   * once, so re-running is safe.
   */
  async settlePeriod(periodStart: Date): Promise<SettlementResult> {
    const empty = (abortedBecause?: SettlementAbortReason): SettlementResult => ({
      periodStart,
      poolsSettled: 0,
      contributorsCredited: 0,
      totalAccruedDl: '0',
      alreadySettled: 0,
      abortedBecause,
    });

    if (!(await this.settings.areRoyaltiesEnabled())) {
      this.logger.log('Royalties are disabled; nothing settled');
      return empty('royalties_disabled');
    }
    if (await this.settings.isRoyaltyShadowMode()) {
      // The point of shadow mode. Pools exist and pay nobody until an admin
      // deliberately leaves it.
      this.logger.log('Royalty shadow mode is on; pools computed but nothing settled');
      return empty('shadow_mode');
    }
    if (await this.tokenomics.isMintingPaused()) {
      // The platform-wide kill switch on token issuance, honoured by every
      // other credit path (auth.service.ts, settlement-job). Royalty DL is real
      // issued DL, so an admin stopping issuance must stop this too -- a switch
      // that some paths ignore is not a kill switch.
      this.logger.warn('Minting is paused; refusing to settle royalty pools');
      return empty('minting_paused');
    }

    const pools = await this.unsettledPools(periodStart);
    if (pools.length === 0) {
      this.logger.log(`No unsettled royalty pools for period ${iso(periodStart)}`);
      return empty();
    }

    // Blast-radius check across the WHOLE run, before anything moves. A pool is
    // priced from an FX rate, a share percent and a token rate; a mistake in
    // any of them scales every pool in the run at once and still looks valid.
    const runTotal = pools.reduce((sum, pool) => sum.plus(pool.poolDl), new Prisma.Decimal(0));
    const cap = new Prisma.Decimal(await this.settings.getRoyaltyMaxRunAccrualDl());
    if (runTotal.greaterThan(cap)) {
      this.logger.error(
        `Refusing to settle period ${iso(periodStart)}: run total ${runTotal.toString()} DL exceeds the cap of ${cap.toString()} DL across ${pools.length} pools. Nothing was settled.`,
      );
      return empty('run_cap_exceeded');
    }

    let poolsSettled = 0;
    let contributorsCredited = 0;
    let alreadySettled = 0;
    let accrued = new Prisma.Decimal(0);

    for (const pool of pools) {
      const settled = await this.settlePool(pool);
      if (!settled) {
        alreadySettled += 1;
        continue;
      }
      poolsSettled += 1;
      contributorsCredited += pool.accruals.length;
      accrued = accrued.plus(pool.poolDl);
    }

    this.logger.log(
      `Settled period ${iso(periodStart)}: ${poolsSettled} pools, ${contributorsCredited} contributor credits, ${accrued.toString()} DL accrued${
        alreadySettled > 0 ? `, ${alreadySettled} already settled by a concurrent run` : ''
      }`,
    );

    return {
      periodStart,
      poolsSettled,
      contributorsCredited,
      totalAccruedDl: accrued.toString(),
      alreadySettled,
    };
  }

  /**
   * Pools awaiting settlement, with their accruals.
   *
   * Only pools that actually allocated something: a pool with no accruals has
   * no payee, and stamping it settled would hide a computation bug behind a
   * successful-looking run.
   */
  private async unsettledPools(periodStart: Date): Promise<SettleablePool[]> {
    const rows = await this.prisma.royaltyPool.findMany({
      where: { periodStart, settledAt: null },
      select: {
        id: true,
        organizationId: true,
        collectedUsd: true,
        poolDl: true,
        accruals: { select: { contributorId: true, amountDl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.filter((row) => row.accruals.length > 0);
  }

  /**
   * Settle one pool, in one transaction.
   *
   * Order matters and is the order in section 5.3: claim, then write. Nothing
   * outside the claim can run twice.
   *
   * **On the mint.** Section 5.3 specifies a `TokenOperation` MINT alongside
   * the reserve inflow, on the reasoning that revenue arriving and DL being
   * issued are two halves of one fact. That reasoning is right, and the mint is
   * deliberately NOT implemented here, because the second half cannot currently
   * be honest:
   *
   * `TokenomicsService.getStatus` computes `eligibleReserveUsd` -- the coverage
   * numerator -- by summing `ReserveBalanceSnapshot`, which
   * `reserve-balance-poll.ts` fills from Flutterwave and NOWPayments ONLY.
   * Voice Stream revenue arrives through Stripe, which is not polled and has no
   * `ReserveAccount`. Minting would therefore raise `redeemable` (the coverage
   * denominator, which now includes `royaltyBalance`) while the cash backing it
   * stayed invisible to the numerator -- coverage falling on every settlement.
   * That is precisely the dilution the reserve engine exists to prevent, so
   * doing it "as specified" would violate the specification's own purpose.
   *
   * What happens instead: the collected revenue IS recorded as a
   * `BUSINESS_REVENUE` reserve transaction, so the inflow is on the books and
   * auditable, and `royaltyBalance` is credited as a real platform liability.
   * The DL is issued in the sense that a contributor holds and can withdraw it;
   * it is simply not yet mirrored into `TokenAccount`. Adding the mint is a
   * one-line change once Stripe is a polled reserve source, and until then
   * `summarizeSupply` still counts `royaltyBalance` in `totalMinted` (Phase 5,
   * 6.1b) so supply does not under-report.
   */
  private async settlePool(pool: SettleablePool): Promise<boolean> {
    const settledAt = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Claim. Before any write, and the only thing standing between a
        // concurrent run and a double credit.
        const claim = await tx.royaltyPool.updateMany({
          where: { id: pool.id, settledAt: null },
          data: { settledAt },
        });
        if (claim.count === 0) return false;

        // 2. Reserve inflow. One row per pool, idempotent on its key so a
        // retry after a partial failure cannot double-credit the reserve.
        await this.recordReserveInflow(tx, pool);

        // 3. Credit each contributor: ledger row and royaltyBalance together,
        // never one without the other.
        for (const accrual of pool.accruals) {
          if (accrual.amountDl.lessThanOrEqualTo(0)) continue;
          const wallet = await tx.wallet.upsert({
            where: { userId: accrual.contributorId },
            update: {},
            create: { userId: accrual.contributorId },
            select: { id: true },
          });
          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              type: LedgerEntryType.ROYALTY_ACCRUAL,
              amount: accrual.amountDl,
              // The pool id, so a credit is traceable to the exact pool -- and
              // the (walletId, type, reference) unique constraint makes a
              // second credit for the same pool impossible even if the claim
              // above were somehow bypassed.
              reference: pool.id,
            },
          });
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { royaltyBalance: { increment: accrual.amountDl } },
          });
        }
        return true;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A ledger row for this pool already exists: this pool was settled by a
        // run that claimed it between our read and our claim. The transaction
        // rolled back, so nothing partial survives.
        this.logger.warn(`Pool ${pool.id} was already credited; skipped`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Record the collected revenue as a reserve inflow.
   *
   * `BUSINESS_REVENUE`, which is what this is: money earned by selling access,
   * not a user funding their own wallet (`PAYMENT_FUNDING`). Its own
   * `ReserveAccount` for Stripe, created on first use, following the
   * provider/asset/network shape the NOWPayments and Flutterwave paths use.
   *
   * `ELIGIBLE` rather than `PENDING`: the money has already arrived -- Phase 2
   * only records a payment on `invoice.payment_succeeded`, never on an invoice
   * merely being raised.
   */
  private async recordReserveInflow(
    tx: Prisma.TransactionClient,
    pool: SettleablePool,
  ): Promise<void> {
    const reserveAccount = await tx.reserveAccount.upsert({
      where: { provider_asset_network: { provider: 'stripe', asset: 'USD', network: '' } },
      update: {},
      create: { provider: 'stripe', asset: 'USD', network: '', currency: 'USD' },
    });
    const idempotencyKey = `royalty-pool:${pool.id}`;
    await tx.reserveTransaction.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        reserveAccountId: reserveAccount.id,
        type: ReserveTransactionType.BUSINESS_REVENUE,
        status: ReserveTransactionStatus.ELIGIBLE,
        direction: ReserveDirection.CREDIT,
        amount: pool.collectedUsd,
        eligibleUsdAmount: pool.collectedUsd,
        // Already USD: the pool converted at computation time and recorded the
        // rate it used on its own row.
        normalizationRate: new Prisma.Decimal(1),
        sourceReference: pool.id,
        idempotencyKey,
        reason: 'Voice Stream subscription revenue backing a royalty pool',
        metadata: { organizationId: pool.organizationId, poolDl: pool.poolDl.toString() },
        settledAt: new Date(),
      },
    });
  }
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
