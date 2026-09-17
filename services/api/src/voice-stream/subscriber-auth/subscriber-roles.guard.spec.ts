import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberRolesGuard } from './subscriber-roles.guard';
import { SUBSCRIBER_ROLES_KEY } from './subscriber-roles.decorator';

/**
 * This guard is the real access boundary for the Voice Stream dashboard --
 * stream/middleware.ts and the UI's role checks only decide what to render,
 * and a subscriber can call the API directly regardless of either.
 */
describe('SubscriberRolesGuard', () => {
  function contextFor(orgRole: SubscriberOrgRole | undefined): ExecutionContext {
    const handler = () => undefined;
    class Controller {}
    return {
      getHandler: () => handler,
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { orgRole } }) }),
    } as unknown as ExecutionContext;
  }

  function guardWith(requiredRoles: SubscriberOrgRole[] | undefined) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);
    return new SubscriberRolesGuard(reflector);
  }

  it('allows a role that is in the required list', () => {
    const guard = guardWith([SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN]);
    expect(guard.canActivate(contextFor(SubscriberOrgRole.ADMIN))).toBe(true);
  });

  it('rejects a role that is not in the required list', () => {
    const guard = guardWith([SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN]);
    expect(() => guard.canActivate(contextFor(SubscriberOrgRole.VALIDATOR))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the request carries no role at all', () => {
    const guard = guardWith([SubscriberOrgRole.OWNER]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  // An undecorated route is open to any authenticated subscriber by design --
  // SubscriberAuthGuard has already established membership. Worth pinning so
  // nobody "fixes" this into a default-deny that silently 403s every route
  // that hasn't opted in.
  it('allows any role when no @SubscriberRoles() is present', () => {
    expect(guardWith(undefined).canActivate(contextFor(SubscriberOrgRole.VALIDATOR))).toBe(true);
    expect(guardWith([]).canActivate(contextFor(SubscriberOrgRole.VALIDATOR))).toBe(true);
  });

  it('reads metadata from handler and class, so a controller-level decorator applies', () => {
    const reflector = new Reflector();
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([SubscriberOrgRole.OWNER]);
    const guard = new SubscriberRolesGuard(reflector);

    guard.canActivate(contextFor(SubscriberOrgRole.OWNER));

    // ReportsController decorates the class, not each handler -- if this only
    // checked the handler, that controller would be unguarded.
    expect(spy).toHaveBeenCalledWith(SUBSCRIBER_ROLES_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });
});
