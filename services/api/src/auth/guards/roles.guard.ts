import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@dialectiva/db';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../strategies/jwt-auth.guard';

/**
 * Reads the role claim JwtAuthGuard already attached to the request --
 * always pair @Roles(...) with @UseGuards(JwtAuthGuard, RolesGuard) in that
 * order, since RolesGuard assumes request.user is already populated.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
