import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { RoyaltyRateService } from './royalty-rate.service';
import { periodStartOf } from './usage-aggregation.service';

/** Why a payment produced no pool. Reported, never silently skipped. */
export type PoolSkipReason =
  | 'refunded'
  | 'no_usage'
  | 'no_fx_rate'
  | 'zero_amount'
  | 'already_pooled';

export interface PoolComputationResult {
  periodStart: Date;
  poolsWritten: number;
  accrualsWritten: number;
  /** Count per reason. A non-zero no_fx_rate is an operational problem. */
  skipped: Record<PoolSkipReason, number>;
  /** True when nothing was minted -- always true at this phase. */
  shadowMode: boolean;
}

interface FxResolution {
  collectedUsd: Prisma.Decimal;
  fxRateUsed: Prisma.Decimal;
}

const USD_EQUIVALENT = new Set(['USD', 'USDT', 'USDC']);

/**
 * Computes royalty pools from collected revenue and aggregated usage.
 *
 * SHADOW MODE AT THIS PHASE. Every pool is written with `settledAt: null`:
 * every input frozen, every share allocated to the cent, nothing minted and no
 * balance credited. docs/Stream-Revenue-Sharing-Engine.md 7 requires the split
 * rule to run against at least one full period of real traffic before it
 * handles money, and `settledAt: null` is that state's natural representation.
 *
 * Four properties define it:
 *
 * 1. **One pool per payment, per subscriber.** `RoyaltyPool.paymentId` is
 *    unique, which is the entire idempotency story -- a re-run cannot create a
 *    second pool for a payment however many times it runs. And pools are
 *    per-subscriber because a platform-wide pool would dilute a niche dialect
 *    streamed heavily by one subscriber against total platform usage.
 *
 * 2. **Collected revenue only.** A refunded payment funds nothing. Computing
 *    from a plan price would mint DL against money that may never have
 *    arrived -- the dilution the reserve engine exists to prevent.
 *
 * 3. **Every input is frozen on the row.** The FX rate, the share percent, the
 *    token rate, the denominator. Not audit garnish: it is what makes a later
 *    settings change unable to reprice a pool, and what makes a historical
 *    settlement recomputable from its own row.
 *
 * 4. **The allocations sum to poolDl exactly.** Asserted, and a pool that does
 *    not balance is abandoned loudly rather than written. With money attached
 *    this is the difference between minting against the reserve inflow and
 *    minting against something close to it.
 */
@Injectable()
export class RoyaltyPoolService {
  private readonly logger = new Logger(RoyaltyPoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly rates: RoyaltyRateService,
  ) {}

  /**
   * Compute every missing pool for a period.
   *
   * Defaults to the previous month, matching UsageAggregationService: this runs
   * after aggregation, on the same closed period.
   */
  async computePeriod(at?: Date): Promise<PoolComputationResult> {
    const anchor = at ?? previousMonthAnchor();
    const periodStart = periodStartOf(anchor);
    const skipped: Record<PoolSkipReason, number> = {
      refunded: 0,
      no_usage: 0,
      no_fx_rate: 0,
      zero_amount: 0,
      already_pooled: 0,
    };
    const empty: PoolComputationResult = {
      periodStart,
      poolsWritten: 0,
      accrualsWritten: 0,
      skipped,
      shadowMode: true,
    };

    if (!(await this.settings.areRoyaltiesEnabled())) {
      this.logger.log('Royalties are disabled; no pools computed');
      return empty;
    }

    // Read once, freeze onto every pool this run writes. Reading per-pool
    // would let a mid-run settings change split one period across two rates.
    const sharePercent = await this.rates.rateForPeriod(periodStart);
    if (sharePercent === null) {
      // Deliberately a hard stop, not a default. A pool computed at an assumed
      // rate is a silently wrong payout.
      this.logger.error(
        `No royalty rate is scheduled for period ${iso(periodStart)}; refusing to compute pools`,
      );
      return empty;
    }
    const tokenUsdRate = await this.settings.getTokenUsdRate();
    if (!Number.isFinite(tokenUsdRate) || tokenUsdRate <= 0) {
      this.logger.error(`Invalid token USD rate ${tokenUsdRate}; refusing to compute pools`);
      return empty;
    }

    const payments = await this.paymentsForPeriod(periodStart);
    if (payments.length === 0) {
      this.logger.log(`No collected payments cover period ${iso(periodStart)}`);
      return empty;
    }

    const fxRates = await this.loadFxRates();
    const usage = await this.usageByOrganization(periodStart);

    let poolsWritten = 0;
    let accrualsWritten = 0;

    for (const payment of payments) {
      if (payment.royaltyPool) {
        skipped.already_pooled += 1;
        continue;
      }
      if (payment.refundedAt !== null) {
        // Excluded rather than pro-rated. A partial refund still means the
        // collected figure is in dispute, and 5.5 handles recovery from an
        // already-settled pool -- not a partly-funded new one.
        skipped.refunded += 1;
        continue;
      }
      if (payment.amountPaidCents <= 0) {
        skipped.zero_amount += 1;
        continue;
      }

      const fx = this.toUsd(payment.amountPaidCents, payment.currency, fxRates);
      if (!fx) {
        // Never default the rate to 1. Treating NGN as USD would overpay by
        // three orders of magnitude.
        this.logger.error(
          `No USD exchange rate for currency ${payment.currency} (payment ${payment.id}); pool skipped`,
        );
        skipped.no_fx_rate += 1;
        continue;
      }

      const orgUsage = usage.get(payment.organizationId);
      if (!orgUsage || orgUsage.totalStreamCount === 0) {
        // Paid but streamed nothing. There is no denominator, so there is
        // nothing to divide -- and no contributor has a claim on it.
        skipped.no_usage += 1;
        continue;
      }

      const poolDl = poolDlFrom(fx.collectedUsd, sharePercent, tokenUsdRate);
      if (poolDl.lessThanOrEqualTo(0)) {
        skipped.zero_amount += 1;
        continue;
      }

      const allocations = allocate(poolDl, orgUsage.contributors);
      const sum = allocations.reduce(
        (total, a) => total.plus(a.amountDl),
        new Prisma.Decimal(0),
      );
      if (!sum.equals(poolDl)) {
        // Must never write. A settlement that does not balance would mint an
        // amount different from the reserve inflow it is backed by.
        this.logger.error(
          `Pool for payment ${payment.id} does not balance: allocations ${sum.toString()} != pool ${poolDl.toString()}; pool abandoned`,
        );
        continue;
      }

      const written = await this.writePool({
        organizationId: payment.organizationId,
        paymentId: payment.id,
        periodStart,
        collectedUsd: fx.collectedUsd,
        fxRateUsed: fx.fxRateUsed,
        sharePercentUsed: sharePercent,
        tokenUsdRateUsed: new Prisma.Decimal(tokenUsdRate),
        poolDl,
        totalStreamCount: orgUsage.totalStreamCount,
        allocations,
      });
      if (!written) {
        // Lost a race with a concurrent run. The unique constraint on
        // paymentId is what makes that safe rather than a double pool.
        skipped.already_pooled += 1;
        continue;
      }
      poolsWritten += 1;
      accrualsWritten += allocations.length;
    }

    this.logger.log(
      `Period ${iso(periodStart)}: ${poolsWritten} pools, ${accrualsWritten} accruals, SHADOW MODE (nothing minted). Skipped ${JSON.stringify(skipped)}`,
    );
    return { periodStart, poolsWritten, accrualsWritten, skipped, shadowMode: true };
  }

  /**
   * Payments whose Stripe billing window overlaps the period.
   *
   * Overlap, not containment: the Stripe billing period is the subscriber own
   * anniversary window and rarely aligns with a calendar month, so a
   * containment test would silently fund no pool for most subscribers.
   */
  private async paymentsForPeriod(periodStart: Date) {
    const periodEnd = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
    );
    return this.prisma.subscriptionPayment.findMany({
      where: { periodStart: { lt: periodEnd }, periodEnd: { gt: periodStart } },
      select: {
        id: true,
        organizationId: true,
        amountPaidCents: true,
        currency: true,
        refundedAt: true,
        royaltyPool: { select: { id: true } },
      },
      orderBy: { paidAt: 'asc' },
    });
  }

  /**
   * currency -> { rate, source }, from Country.
   *
   * The source travels with the rate because `MANUAL` rows are admin-pinned and
   * deliberately never refreshed by fx-rate-job. That is right for payouts, but
   * it means a stale manual rate can price a pool, so it is logged.
   */
  private async loadFxRates(): Promise<Map<string, { rate: Prisma.Decimal; source: string }>> {
    const countries = await this.prisma.country.findMany({
      where: { usdExchangeRate: { not: null } },
      select: { currencyCode: true, usdExchangeRate: true, exchangeRateSource: true },
      orderBy: { exchangeRateUpdatedAt: 'desc' },
    });
    const map = new Map<string, { rate: Prisma.Decimal; source: string }>();
    for (const country of countries) {
      if (!country.usdExchangeRate) continue;
      const key = country.currencyCode.toUpperCase();
      // Most recently updated wins; production has no currency with two
      // conflicting rates, and orderBy makes the tie-break deterministic.
      if (!map.has(key)) {
        map.set(key, { rate: country.usdExchangeRate, source: country.exchangeRateSource });
      }
    }
    return map;
  }

  /**
   * Convert minor units to USD.
   *
   * Country.usdExchangeRate is units of local currency per 1 USD, so this
   * DIVIDES by the rate. Multiplying would inflate an NGN pool by roughly
   * 1,500x, which is the single most expensive sign error available here.
   */
  private toUsd(
    amountPaidCents: number,
    currency: string,
    fxRates: Map<string, { rate: Prisma.Decimal; source: string }>,
  ): FxResolution | null {
    const code = currency.toUpperCase();
    const major = new Prisma.Decimal(amountPaidCents).dividedBy(100);
    if (USD_EQUIVALENT.has(code)) {
      return { collectedUsd: round(major, 2), fxRateUsed: new Prisma.Decimal(1) };
    }
    const entry = fxRates.get(code);
    if (!entry || entry.rate.lessThanOrEqualTo(0)) return null;
    if (entry.source === 'MANUAL') {
      this.logger.warn(
        `Pricing a pool in ${code} from an admin-pinned MANUAL exchange rate (${entry.rate.toString()}); fx-rate-job does not refresh it`,
      );
    }
    return {
      collectedUsd: round(major.dividedBy(entry.rate), 2),
      fxRateUsed: entry.rate,
    };
  }

  /**
   * Each organisation period usage: total stream count and per-contributor
   * counts.
   *
   * Aggregated from RecordingUsagePeriod rather than the access log directly,
   * so a pool divides exactly the figures the aggregator published -- one
   * source of truth for "what was streamed", recomputable independently.
   */
  private async usageByOrganization(periodStart: Date) {
    const rows = await this.prisma.recordingUsagePeriod.groupBy({
      by: ['organizationId', 'contributorId'],
      where: { periodStart },
      _sum: { streamCount: true },
    });
    const byOrg = new Map<
      string,
      { totalStreamCount: number; contributors: { contributorId: string; streamCount: number }[] }
    >();
    for (const row of rows) {
      const streamCount = row._sum.streamCount ?? 0;
      if (streamCount <= 0) continue;
      const entry = byOrg.get(row.organizationId) ?? {
        totalStreamCount: 0,
        contributors: [],
      };
      entry.totalStreamCount += streamCount;
      entry.contributors.push({ contributorId: row.contributorId, streamCount });
      byOrg.set(row.organizationId, entry);
    }
    return byOrg;
  }

  /**
   * Write one pool and its accruals, or nothing.
   *
   * One transaction, and the pool row first: its unique paymentId is what makes
   * a concurrent run fail here rather than produce a second pool. A pool
   * without its accruals would be a recorded obligation with no payees, so the
   * two cannot be separate transactions.
   *
   * settledAt is left NULL. In shadow mode that is the end of the story; when
   * Phase 6 lands, the settlement step claims exactly these rows.
   */
  private async writePool(input: {
    organizationId: string;
    paymentId: string;
    periodStart: Date;
    collectedUsd: Prisma.Decimal;
    fxRateUsed: Prisma.Decimal;
    sharePercentUsed: Prisma.Decimal;
    tokenUsdRateUsed: Prisma.Decimal;
    poolDl: Prisma.Decimal;
    totalStreamCount: number;
    allocations: { contributorId: string; streamCount: number; amountDl: Prisma.Decimal }[];
  }): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const pool = await tx.royaltyPool.create({
          data: {
            organizationId: input.organizationId,
            paymentId: input.paymentId,
            periodStart: input.periodStart,
            collectedUsd: input.collectedUsd,
            fxRateUsed: input.fxRateUsed,
            sharePercentUsed: input.sharePercentUsed,
            tokenUsdRateUsed: input.tokenUsdRateUsed,
            poolDl: input.poolDl,
            totalStreamCount: input.totalStreamCount,
            settledAt: null,
          },
          select: { id: true },
        });
        await tx.royaltyAccrual.createMany({
          data: input.allocations.map((a) => ({
            poolId: pool.id,
            contributorId: a.contributorId,
            streamCount: a.streamCount,
            amountDl: a.amountDl,
          })),
        });
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}

/** pool_dl = (collectedUsd x sharePercent / 100) / tokenUsdRate, to 8dp. */
function poolDlFrom(
  collectedUsd: Prisma.Decimal,
  sharePercent: Prisma.Decimal,
  tokenUsdRate: number,
): Prisma.Decimal {
  const shareUsd = collectedUsd.times(sharePercent).dividedBy(100);
  return round(shareUsd.dividedBy(tokenUsdRate), 8);
}

/**
 * Split a pool by stream count, allocating the rounding remainder to the
 * largest share.
 *
 * DL is Decimal(20,8), so a pool almost never divides evenly. Rounding each
 * share independently would leave the allocations summing to slightly less than
 * the pool -- and with money attached, minting against a total that is not the
 * reserve inflow is exactly the drift the reserve exists to catch.
 *
 * The remainder goes to the largest share, ties broken by contributorId so the
 * choice is deterministic and a re-run reproduces it byte for byte. Giving it
 * to the largest holder rather than the first is the least distortive option:
 * a fraction of a DL against the biggest share is the smallest relative change
 * available.
 */
export function allocate(
  poolDl: Prisma.Decimal,
  contributors: { contributorId: string; streamCount: number }[],
): { contributorId: string; streamCount: number; amountDl: Prisma.Decimal }[] {
  const total = contributors.reduce((sum, c) => sum + c.streamCount, 0);
  if (total <= 0) return [];

  // Sorted so both the allocation order and the remainder recipient are
  // deterministic regardless of the order the database returned rows in.
  const ordered = [...contributors].sort(
    (a, b) => b.streamCount - a.streamCount || a.contributorId.localeCompare(b.contributorId),
  );

  const allocations = ordered.map((c) => ({
    contributorId: c.contributorId,
    streamCount: c.streamCount,
    amountDl: round(poolDl.times(c.streamCount).dividedBy(total), 8),
  }));

  const sum = allocations.reduce((s, a) => s.plus(a.amountDl), new Prisma.Decimal(0));
  const remainder = poolDl.minus(sum);
  if (!remainder.isZero() && allocations.length > 0) {
    allocations[0].amountDl = allocations[0].amountDl.plus(remainder);
  }
  return allocations;
}

function round(value: Prisma.Decimal, dp: number): Prisma.Decimal {
  return value.toDecimalPlaces(dp, Prisma.Decimal.ROUND_DOWN);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** An instant inside the previous month. Same convention as the aggregator. */
function previousMonthAnchor(now = new Date()): Date {
  const thisMonth = periodStartOf(now);
  return new Date(thisMonth.getTime() - 24 * 60 * 60 * 1000);
}
