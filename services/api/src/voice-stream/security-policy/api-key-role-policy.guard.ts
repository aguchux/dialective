import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedSubscriberRequest } from '../subscriber-auth/subscriber-auth.guard';

/**
 * Enforces SubscriberOrgSecurityPolicy.minRoleForApiKeyCreation when set,
 * narrowing StreamKeysController.CAN_MANAGE_KEYS's platform-default role set
 * for this org specifically. Must run after SubscriberAuthGuard AND
 * SubscriberRolesGuard (that guard enforces the platform-wide floor; this one
 * can only narrow further, never widen).
 */
@Injectable()
export class ApiKeyRolePolicyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
    const policy = await this.prisma.subscriberOrgSecurityPolicy.findUnique({
      where: { organizationId: request.user.organizationId },
    });
    if (!policy || policy.minRoleForApiKeyCreation.length === 0) {
      return true; // no org-specific narrowing configured
    }
    if (!policy.minRoleForApiKeyCreation.includes(request.user.orgRole)) {
      throw new ForbiddenException(
        "This organization's security policy restricts API key creation to specific roles",
      );
    }
    return true;
  }
}
