import { ForbiddenException } from '@nestjs/common';
import { SecurityPolicyEntitlementGuard } from './security-policy-entitlement.guard';

function setup() {
  const prisma: any = { subscription: { findUnique: jest.fn() } };
  const guard = new SecurityPolicyEntitlementGuard(prisma as never);
  return { guard, prisma };
}

function ctxWith(organizationId: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { organizationId } }) }),
  } as any;
}

describe('SecurityPolicyEntitlementGuard.canActivate', () => {
  it('throws ForbiddenException when the plan flag is off', async () => {
    const { guard, prisma } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { enterpriseSecurityPoliciesEnabled: false },
    });

    await expect(guard.canActivate(ctxWith('org-1'))).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no subscription at all', async () => {
    const { guard, prisma } = setup();
    prisma.subscription.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(ctxWith('org-1'))).rejects.toThrow(ForbiddenException);
  });

  it('allows when the plan flag is on', async () => {
    const { guard, prisma } = setup();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { enterpriseSecurityPoliciesEnabled: true },
    });

    const result = await guard.canActivate(ctxWith('org-1'));

    expect(result).toBe(true);
  });
});
