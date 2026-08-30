import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

const BLOCKED_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.CANCELED,
];

/** Same posture as RequireActiveSubscriptionGuard, reading request.streamKey (populated by StreamKeyAuthGuard) instead of request.user -- doc section 35 step 5 ("Confirm subscription ACTIVE"). */
@Injectable()
export class StreamKeySubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.streamKey.organizationId },
    });

    if (!subscription || BLOCKED_STATUSES.includes(subscription.status)) {
      throw new ForbiddenException(
        'This organization does not have an active Voice Stream subscription',
      );
    }

    return true;
  }
}
