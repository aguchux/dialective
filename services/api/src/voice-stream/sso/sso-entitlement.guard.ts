import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedSubscriberRequest } from '../subscriber-auth/subscriber-auth.guard';

/**
 * First boolean-shaped plan entitlement gate in this codebase (existing
 * SubscriptionPlan fields are all nullable numeric limits). Modeled on
 * RequireActiveSubscriptionGuard's simple block/allow shape. Must run after
 * SubscriberAuthGuard. Deliberately NOT applied to SsoAcsController -- the
 * ACS endpoint is hit pre-auth by an external IdP and cannot require a
 * subscriber JWT; entitlement there is instead enforced implicitly by
 * SsoIdpConfig.active (an org without an entitled+active config simply has
 * no config to validate an assertion against).
 */
@Injectable()
export class SsoEntitlementGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.user.organizationId },
      include: { plan: true },
    });

    if (!subscription?.plan.ssoEnabled) {
      throw new ForbiddenException('SSO/SAML is not available on this plan');
    }

    return true;
  }
}
