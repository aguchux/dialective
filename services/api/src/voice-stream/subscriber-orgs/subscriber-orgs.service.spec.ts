import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberOrgsService } from './subscriber-orgs.service';

function setup() {
  const prisma = {
    subscriberMembership: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    subscriberOrganization: { findUniqueOrThrow: jest.fn() },
  };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SubscriberOrgsService(prisma as never, orgActivity as never);
  return { service, prisma, orgActivity };
}

describe('SubscriberOrgsService.getOrganization', () => {
  it('stringifies the BigInt plan.monthlyByteQuota (JSON.stringify cannot serialize a raw bigint)', async () => {
    const { service, prisma } = setup();
    prisma.subscriberOrganization.findUniqueOrThrow.mockResolvedValue({
      id: 'org-1',
      subscription: { id: 'sub-1', plan: { key: 'enterprise', monthlyByteQuota: BigInt(1_000_000_000) } },
    });

    const result = await service.getOrganization('org-1');

    expect(result.subscription?.plan.monthlyByteQuota).toBe('1000000000');
  });

  it('passes through unchanged when there is no subscription', async () => {
    const { service, prisma } = setup();
    prisma.subscriberOrganization.findUniqueOrThrow.mockResolvedValue({ id: 'org-1', subscription: null });

    const result = await service.getOrganization('org-1');

    expect(result.subscription).toBeNull();
  });
});

describe('SubscriberOrgsService.updateMemberRole', () => {
  it('rejects a membership belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'other-org',
    });

    await expect(
      service.updateMemberRole('org-1', 'm-1', SubscriberOrgRole.ADMIN, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks demoting the last owner', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.OWNER,
    });
    prisma.subscriberMembership.count.mockResolvedValue(0);

    await expect(
      service.updateMemberRole('org-1', 'm-1', SubscriberOrgRole.ADMIN, 'user-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('records a MEMBER_ROLE_CHANGED activity event on success', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.DATASET_MANAGER,
      userId: 'target-user',
    });
    prisma.subscriberMembership.update.mockResolvedValue({
      id: 'm-1',
      userId: 'target-user',
      role: SubscriberOrgRole.ADMIN,
    });

    await service.updateMemberRole('org-1', 'm-1', SubscriberOrgRole.ADMIN, 'actor-1');

    expect(orgActivity.record).toHaveBeenCalledWith('org-1', 'MEMBER_ROLE_CHANGED', 'actor-1', {
      targetUserId: 'target-user',
      oldRole: SubscriberOrgRole.DATASET_MANAGER,
      newRole: SubscriberOrgRole.ADMIN,
    });
  });
});

describe('SubscriberOrgsService.removeMember', () => {
  it('rejects a membership belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'other-org',
    });

    await expect(service.removeMember('org-1', 'm-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('blocks removing the last owner', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.OWNER,
    });
    prisma.subscriberMembership.count.mockResolvedValue(0);

    await expect(service.removeMember('org-1', 'm-1', 'user-1')).rejects.toThrow(ForbiddenException);
  });

  it('deletes the membership and records a MEMBER_REMOVED activity event', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.DATASET_MANAGER,
      userId: 'target-user',
    });

    await service.removeMember('org-1', 'm-1', 'actor-1');

    expect(prisma.subscriberMembership.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
    expect(orgActivity.record).toHaveBeenCalledWith('org-1', 'MEMBER_REMOVED', 'actor-1', {
      targetUserId: 'target-user',
    });
  });
});
