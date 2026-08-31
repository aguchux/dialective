import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { IsvcConfidence } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedSubscriberRequest } from '../subscriber-auth/subscriber-auth.guard';

export interface TierGatedRequest extends AuthenticatedSubscriberRequest {
  planMinConfidence?: IsvcConfidence;
}

/**
 * Phase 5 tiered pricing (doc section 62). Unlike
 * RequireActiveSubscriptionGuard, this never rejects the request -- a
 * Standard-plan (minIsvcConfidence: null) subscriber gets full access, same
 * as before this phase shipped. It resolves the caller's plan floor and
 * attaches it to the request so CatalogueController can pass it into
 * CatalogueService.search()/preview() as an additional filter, narrowing
 * results rather than blocking the whole request. Must run after
 * SubscriberAuthGuard.
 */
@Injectable()
export class TierGateGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TierGatedRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.user.organizationId },
      select: { plan: { select: { minIsvcConfidence: true } } },
    });
    request.planMinConfidence = subscription?.plan.minIsvcConfidence ?? undefined;
    return true;
  }
}
