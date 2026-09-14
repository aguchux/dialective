import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberOrgsService } from './subscriber-orgs.service';

function setup() {
  const prisma = {
    subscriberMembership: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ role: SubscriberOrgRole.OWNER }),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    subscriberRefreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    subscriberOrganization: { findUniqueOrThrow: jest.fn() },
    subscriberInvite: { findMany: jest.fn().mockResolvedValue([]) },
    orgActivityEvent: { findMany: jest.fn().mockResolvedValue([]) },
    subscriberUser: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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

  it("revokes the target user's refresh tokens so a stale access token can't keep acting at the old role", async () => {
    const { service, prisma } = setup();
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

    expect(prisma.subscriberRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target-user', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('blocks a non-owner actor from promoting a member to owner', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.DATASET_MANAGER,
      userId: 'target-user',
    });
    prisma.subscriberMembership.findFirst.mockResolvedValue({ role: SubscriberOrgRole.ADMIN });

    await expect(
      service.updateMemberRole('org-1', 'm-1', SubscriberOrgRole.OWNER, 'actor-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.subscriberMembership.update).not.toHaveBeenCalled();
  });

  it('blocks a non-owner actor from demoting an existing owner', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.OWNER,
      userId: 'target-user',
    });
    prisma.subscriberMembership.findFirst.mockResolvedValue({ role: SubscriberOrgRole.ADMIN });

    await expect(
      service.updateMemberRole('org-1', 'm-1', SubscriberOrgRole.ADMIN, 'actor-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.subscriberMembership.update).not.toHaveBeenCalled();
  });

  it('allows an owner actor to promote a member to owner', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.ADMIN,
      userId: 'target-user',
    });
    prisma.subscriberMembership.findFirst.mockResolvedValue({ role: SubscriberOrgRole.OWNER });
    prisma.subscriberMembership.update.mockResolvedValue({
      id: 'm-1',
      userId: 'target-user',
      role: SubscriberOrgRole.OWNER,
    });

    await expect(
      service.updateMemberRole('org-1', 'm-1', SubscriberOrgRole.OWNER, 'actor-1'),
    ).resolves.toMatchObject({ role: SubscriberOrgRole.OWNER });
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

  it("revokes the removed user's refresh tokens so access doesn't linger past removal", async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.DATASET_MANAGER,
      userId: 'target-user',
    });

    await service.removeMember('org-1', 'm-1', 'actor-1');

    expect(prisma.subscriberRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target-user', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('blocks a non-owner actor from removing an owner', async () => {
    const { service, prisma } = setup();
    prisma.subscriberMembership.findUnique.mockResolvedValue({
      id: 'm-1',
      organizationId: 'org-1',
      role: SubscriberOrgRole.OWNER,
      userId: 'target-user',
    });
    prisma.subscriberMembership.findFirst.mockResolvedValue({ role: SubscriberOrgRole.ADMIN });
    prisma.subscriberMembership.count.mockResolvedValue(1);

    await expect(service.removeMember('org-1', 'm-1', 'actor-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.subscriberMembership.delete).not.toHaveBeenCalled();
  });
});

describe('SubscriberOrgsService.listPendingInvites', () => {
  it('only queries un-accepted, non-expired invites for the org', async () => {
    const { service, prisma } = setup();

    await service.listPendingInvites('org-1');

    expect(prisma.subscriberInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', acceptedAt: null, expiresAt: { gt: expect.any(Date) } },
      }),
    );
  });
});

describe('SubscriberOrgsService.listActivity', () => {
  it('resolves actor names for events with a non-null actorUserId', async () => {
    const { service, prisma } = setup();
    prisma.orgActivityEvent.findMany.mockResolvedValue([
      { id: 'e-1', organizationId: 'org-1', eventType: 'MEMBER_ROLE_CHANGED', actorUserId: 'actor-1', metadata: {}, createdAt: new Date() },
      { id: 'e-2', organizationId: 'org-1', eventType: 'SUBSCRIPTION_PLAN_CHANGED', actorUserId: null, metadata: {}, createdAt: new Date() },
    ]);
    prisma.subscriberUser.findMany.mockResolvedValue([
      { id: 'actor-1', firstName: 'Ada', lastName: 'Nwosu', email: 'ada@example.com' },
    ]);

    const result = await service.listActivity('org-1');

    expect(prisma.subscriberUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['actor-1'] } } }),
    );
    expect(result[0].actor).toMatchObject({ firstName: 'Ada' });
    expect(result[1].actor).toBeNull();
  });
});
