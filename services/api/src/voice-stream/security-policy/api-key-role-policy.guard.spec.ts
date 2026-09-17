import { ForbiddenException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { ApiKeyRolePolicyGuard } from './api-key-role-policy.guard';

function setup() {
  const prisma: any = { subscriberOrgSecurityPolicy: { findUnique: jest.fn() } };
  const guard = new ApiKeyRolePolicyGuard(prisma as never);
  return { guard, prisma };
}

function ctxWith(organizationId: string, orgRole: SubscriberOrgRole) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { organizationId, orgRole } }) }),
  } as any;
}

describe('ApiKeyRolePolicyGuard.canActivate', () => {
  it('allows when no policy exists', async () => {
    const { guard, prisma } = setup();
    prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue(null);

    const result = await guard.canActivate(ctxWith('org-1', SubscriberOrgRole.API_DEVELOPER));

    expect(result).toBe(true);
  });

  it('allows when the policy has no role narrowing configured (empty array)', async () => {
    const { guard, prisma } = setup();
    prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({
      minRoleForApiKeyCreation: [],
    });

    const result = await guard.canActivate(ctxWith('org-1', SubscriberOrgRole.API_DEVELOPER));

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when the caller role is not in the allowed set', async () => {
    const { guard, prisma } = setup();
    prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({
      minRoleForApiKeyCreation: [SubscriberOrgRole.OWNER],
    });

    await expect(
      guard.canActivate(ctxWith('org-1', SubscriberOrgRole.API_DEVELOPER)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows when the caller role is included in the allowed set', async () => {
    const { guard, prisma } = setup();
    prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({
      minRoleForApiKeyCreation: [SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN],
    });

    const result = await guard.canActivate(ctxWith('org-1', SubscriberOrgRole.ADMIN));

    expect(result).toBe(true);
  });
});
