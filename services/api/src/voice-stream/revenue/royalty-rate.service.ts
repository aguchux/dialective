import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { periodStartOf } from './usage-aggregation.service';

/**
 * Resolves the contributor share rate in force for a given period, and
 * schedules changes to it.
 *
 * The whole reason this is a service rather than a settings read: settlement
 * must never read "the current rate". A rate change made on the 5th, before a
 * settlement run that was late for the period ending the 1st, would otherwise
 * reprice usage streamed entirely under the old rate. The promise in
 * docs/Stream-Revenue-Sharing-Engine.md 5.4 is the opposite -- a change applies
 * only to usage streamed AFTER it -- and an append-only schedule read by
 * effective date is what makes that true rather than merely intended.
 *
 * A settlement that reads a mutable setting is also not idempotent across a
 * rate change: re-running it after a change would produce a different answer
 * for the same period. Resolving from the schedule makes a re-run reproduce the
 * original.
 */
@Injectable()
export class RoyaltyRateService {
  private readonly logger = new Logger(RoyaltyRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The rate in force for `periodStart`.
   *
   * The latest scheduled rate whose effectiveFrom is at or before the period.
   * Returns null when no rate covers the period at all, and callers must treat
   * that as a hard failure rather than substituting a default: a pool computed
   * at an assumed rate is a silently wrong payout, and the correct response to
   * "no rate was ever scheduled" is to compute no pool.
   */
  async rateForPeriod(periodStart: Date): Promise<Prisma.Decimal | null> {
    const row = await this.prisma.royaltyRatePeriod.findFirst({
      where: { effectiveFrom: { lte: periodStart } },
      orderBy: { effectiveFrom: 'desc' },
      select: { sharePercent: true },
    });
    return row?.sharePercent ?? null;
  }

  /**
   * Schedule a rate change, effective from the period after the current one.
   *
   * Never the current period: a period part-way through has usage already
   * streamed under the existing rate, and repricing it is exactly what 5.4
   * forbids. Scheduling from next period keeps the guarantee that one period
   * always settles at exactly one rate, which is also the only version a
   * contributor can be told plainly ("the rate changed from March").
   *
   * Upserts on effectiveFrom, so an admin who changes their mind twice before
   * the period starts replaces the pending change rather than colliding with
   * it. A rate already in force is never rewritten, because its effectiveFrom
   * is in the past and this only ever writes a future anchor.
   */
  async scheduleChange(
    sharePercent: number,
    changedByUserId: string | null,
    now = new Date(),
  ): Promise<Date> {
    const effectiveFrom = nextPeriodStart(now);
    await this.prisma.royaltyRatePeriod.upsert({
      where: { effectiveFrom },
      create: { sharePercent, effectiveFrom, changedByUserId },
      update: { sharePercent, changedByUserId },
    });
    this.logger.log(
      `Royalty share rate scheduled: ${sharePercent}% from ${effectiveFrom.toISOString().slice(0, 10)}`,
    );
    return effectiveFrom;
  }

  /**
   * Seed the baseline rate so the very first settled period has one.
   *
   * Backdated to the current period rather than the next, because there is no
   * earlier rate it could be repricing -- the schedule is empty. Idempotent:
   * a baseline that already exists is left exactly as it is, so this can run on
   * every boot without ever moving a rate that settlement may already have
   * used.
   */
  async ensureBaseline(sharePercent: number, now = new Date()): Promise<void> {
    const existing = await this.prisma.royaltyRatePeriod.findFirst({
      select: { id: true },
    });
    if (existing) return;
    const effectiveFrom = periodStartOf(now);
    await this.prisma.royaltyRatePeriod.create({
      data: { sharePercent, effectiveFrom, changedByUserId: null },
    });
    this.logger.log(
      `Seeded baseline royalty share rate ${sharePercent}% from ${effectiveFrom.toISOString().slice(0, 10)}`,
    );
  }
}

/** The period anchor after the one containing `at`. */
function nextPeriodStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}
