import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedSubscriberRequest } from '../subscriber-auth/subscriber-auth.guard';

/** Modeled exactly on SsoEntitlementGuard -- second boolean-shaped plan entitlement gate. Must run after SubscriberAuthGuard. */
@Injectable()
export class SecurityPolicyEntitlementGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.user.organizationId },
      include: { plan: true },
    });

    if (!subscription?.plan.enterpriseSecurityPoliciesEnabled) {
      throw new ForbiddenException('Enterprise security policies are not available on this plan');
    }

    return true;
  }
}
