import { SecurityPolicyService } from './security-policy.service';

function setup() {
  const prisma: any = {
    subscriberOrgSecurityPolicy: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SecurityPolicyService(prisma as never, orgActivity as never);
  return { service, prisma, orgActivity };
}

describe('SecurityPolicyService.get', () => {
  it('returns the org policy or null', async () => {
    const { service, prisma } = setup();
    prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({ id: 'policy-1' });

    const result = await service.get('org-1');

    expect(prisma.subscriberOrgSecurityPolicy.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
    expect(result).toEqual({ id: 'policy-1' });
  });
});

describe('SecurityPolicyService.upsert', () => {
  it('creates a policy when absent and records activity', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.subscriberOrgSecurityPolicy.upsert.mockResolvedValue({
      id: 'policy-1',
      requireSso: true,
    });

    const result = await service.upsert('org-1', 'admin-1', { requireSso: true });

    expect(prisma.subscriberOrgSecurityPolicy.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      create: { organizationId: 'org-1', createdByUserId: 'admin-1', requireSso: true },
      update: { requireSso: true },
    });
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'SECURITY_POLICY_UPDATED',
      'admin-1',
      expect.objectContaining({ requireSso: true }),
    );
    expect(result).toEqual({ id: 'policy-1', requireSso: true });
  });

  it('updates a policy when present', async () => {
    const { service, prisma } = setup();
    prisma.subscriberOrgSecurityPolicy.upsert.mockResolvedValue({
      id: 'policy-1',
      requireIpAllowlist: true,
    });

    await service.upsert('org-1', 'admin-1', { requireIpAllowlist: true });

    expect(prisma.subscriberOrgSecurityPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { requireIpAllowlist: true } }),
    );
  });
});

describe('SecurityPolicyService.remove', () => {
  it('deletes the policy and records activity', async () => {
    const { service, prisma, orgActivity } = setup();

    await service.remove('org-1', 'admin-1');

    expect(prisma.subscriberOrgSecurityPolicy.delete).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'SECURITY_POLICY_REMOVED',
      'admin-1',
      {},
    );
  });
});
