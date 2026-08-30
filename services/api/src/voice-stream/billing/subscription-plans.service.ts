import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubscriptionPlanInput {
  key: string;
  name: string;
  stripePriceId: string;
  monthlyUsdAmount: number;
  maxStreamDecks?: number | null;
  maxTeamMembers?: number | null;
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

  list() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { monthlyUsdAmount: 'asc' } });
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
    return this.prisma.subscriptionPlan.upsert({
      where: { key },
      create: {
        key,
        name: input.name.trim(),
        stripePriceId,
        monthlyUsdAmount: input.monthlyUsdAmount,
        maxStreamDecks: input.maxStreamDecks ?? null,
        maxTeamMembers: input.maxTeamMembers ?? null,
        active: input.active ?? true,
      },
      update: {
        name: input.name.trim(),
        stripePriceId,
        monthlyUsdAmount: input.monthlyUsdAmount,
        maxStreamDecks: input.maxStreamDecks ?? null,
        maxTeamMembers: input.maxTeamMembers ?? null,
        ...(input.active !== undefined && { active: input.active }),
      },
    });
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
