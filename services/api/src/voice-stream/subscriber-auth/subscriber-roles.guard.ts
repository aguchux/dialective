import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SUBSCRIBER_ROLES_KEY } from './subscriber-roles.decorator';
import { AuthenticatedSubscriberRequest } from './subscriber-auth.guard';

/**
 * Reads the orgRole claim SubscriberAuthGuard already attached to the
 * request -- always pair @SubscriberRoles(...) with
 * @UseGuards(SubscriberAuthGuard, SubscriberRolesGuard) in that order. The
 * role is embedded in the JWT at login/refresh time (see
 * subscriber-auth.service.ts), not looked up per-request -- Phase 1 has no
 * concept of switching organizations mid-session.
 */
@Injectable()
export class SubscriberRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<SubscriberOrgRole[] | undefined>(
      SUBSCRIBER_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
    if (!requiredRoles.includes(request.user.orgRole)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    return true;
  }
}
