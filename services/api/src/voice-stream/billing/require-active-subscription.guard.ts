import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedSubscriberRequest } from '../subscriber-auth/subscriber-auth.guard';

const BLOCKED_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.CANCELED,
];

/**
 * Gates deck creation and catalogue preview on the organization having a
 * subscription that isn't SUSPENDED/CANCELED, per the product plan's
 * section 43 access matrix (dashboard/billing stay reachable either way;
 * this only blocks the data-access actions). Must run after
 * SubscriberAuthGuard has populated request.user. Phase 1 does not
 * implement the full 7-day dunning cron -- Stripe's own retry schedule plus
 * BillingService's webhook handling keeps `status` accurate.
 */
@Injectable()
export class RequireActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.user.organizationId },
    });

    if (!subscription || BLOCKED_STATUSES.includes(subscription.status)) {
      throw new ForbiddenException(
        'This organization does not have an active Voice Stream subscription',
      );
    }

    return true;
  }
}
