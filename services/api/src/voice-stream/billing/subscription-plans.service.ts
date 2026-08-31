import { BadRequestException, Injectable } from '@nestjs/common';
import { IsvcConfidence, SubscriptionPlan } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

/** monthlyByteQuota is a Prisma BigInt -- JSON.stringify can't serialize a bigint, so every controller-reachable return of a SubscriptionPlan row converts it to a string first, matching this codebase's existing convention for StreamAccessLog.bytesStreamed/UsageCounter.bytesUsed. */
function serializePlan(plan: SubscriptionPlan) {
  return { ...plan, monthlyByteQuota: plan.monthlyByteQuota?.toString() ?? null };
}

export interface SubscriptionPlanInput {
  key: string;
  name: string;
  stripePriceId: string;
  monthlyUsdAmount: number;
  maxStreamDecks?: number | null;
  maxTeamMembers?: number | null;
  /** Phase 5 tiered pricing -- null means full catalogue access (current behavior). */
  minIsvcConfidence?: IsvcConfidence | null;
  /** Phase 4b advanced quota policies -- null means unlimited, enforced by QuotaGuard. */
  monthlyByteQuota?: bigint | null;
  monthlyRequestQuota?: number | null;
  active?: boolean;
}

/**
 * Admin CRUD over SubscriptionPlan -- the 3 Voice Stream tiers (starter,
 * professional, enterprise) and their Stripe Price ids. BillingService.
 * createCheckoutSession reads plan.stripePriceId straight from this table,
 * so this is the only place a Price id is ever configured -- no env var,
 * no k8s secret (see docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md's
 * Stripe billing section). Deliberately upsert-by-key rather than a
 * separate create/update pair: an admin editing the "starter" row and an
 * admin defining "starter" for the first time go through the same form.
 */
@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const plans = await this.prisma.subscriptionPlan.findMany({ orderBy: { monthlyUsdAmount: 'asc' } });
    return plans.map(serializePlan);
  }

  /** Public pricing page -- active plans only, and only the fields a prospective subscriber should see (no Stripe Price id). */
  async listPublic() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { monthlyUsdAmount: 'asc' },
    });
    return plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      monthlyUsdAmount: plan.monthlyUsdAmount,
      maxStreamDecks: plan.maxStreamDecks,
      maxTeamMembers: plan.maxTeamMembers,
      minIsvcConfidence: plan.minIsvcConfidence,
      monthlyByteQuota: plan.monthlyByteQuota?.toString() ?? null,
      monthlyRequestQuota: plan.monthlyRequestQuota,
    }));
  }

  async upsert(input: SubscriptionPlanInput) {
    const key = input.key.trim();
    const stripePriceId = input.stripePriceId.trim();
    if (!key) {
      throw new BadRequestException('key is required');
    }
    if (!stripePriceId) {
      throw new BadRequestException('stripePriceId is required');
    }
    const clashing = await this.prisma.subscriptionPlan.findFirst({
      where: { stripePriceId, key: { not: key } },
    });
    if (clashing) {
      throw new BadRequestException(
        `stripePriceId is already used by plan "${clashing.key}" -- each plan needs its own Stripe Price id`,
      );
    }
    const row = await this.prisma.subscriptionPlan.upsert({
      where: { key },
      create: {
        key,
        name: input.name.trim(),
        stripePriceId,
        monthlyUsdAmount: input.monthlyUsdAmount,
        maxStreamDecks: input.maxStreamDecks ?? null,
        maxTeamMembers: input.maxTeamMembers ?? null,
        minIsvcConfidence: input.minIsvcConfidence ?? null,
        monthlyByteQuota: input.monthlyByteQuota ?? null,
        monthlyRequestQuota: input.monthlyRequestQuota ?? null,
        active: input.active ?? true,
      },
      update: {
        name: input.name.trim(),
        stripePriceId,
        monthlyUsdAmount: input.monthlyUsdAmount,
        maxStreamDecks: input.maxStreamDecks ?? null,
        maxTeamMembers: input.maxTeamMembers ?? null,
        minIsvcConfidence: input.minIsvcConfidence ?? null,
        monthlyByteQuota: input.monthlyByteQuota ?? null,
        monthlyRequestQuota: input.monthlyRequestQuota ?? null,
        ...(input.active !== undefined && { active: input.active }),
      },
    });
    return serializePlan(row);
  }

  async remove(key: string) {
    const inUse = await this.prisma.subscription.findFirst({ where: { plan: { key } } });
    if (inUse) {
      throw new BadRequestException(
        'Cannot delete a plan with active subscriptions -- deactivate it instead',
      );
    }
    await this.prisma.subscriptionPlan.deleteMany({ where: { key } });
  }
}
