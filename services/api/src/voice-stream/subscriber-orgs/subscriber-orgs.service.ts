import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEventType, SubscriberOrgRole } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgActivityService } from '../org-activity/org-activity.service';

@Injectable()
export class SubscriberOrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.subscriberUser.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, emailVerifiedAt: true },
    });
    const memberships = await this.prisma.subscriberMembership.findMany({
      where: { userId, acceptedAt: { not: null } },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
    return { ...user, memberships };
  }

  async getOrganization(organizationId: string) {
    const org = await this.prisma.subscriberOrganization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { subscription: { include: { plan: true } } },
    });
    // plan.monthlyByteQuota is a Prisma BigInt -- JSON.stringify can't
    // serialize it, so convert before this reaches the controller (same
    // convention as SubscriptionPlansService.list/upsert).
    if (org.subscription) {
      return {
        ...org,
        subscription: {
          ...org.subscription,
          plan: {
            ...org.subscription.plan,
            monthlyByteQuota: org.subscription.plan.monthlyByteQuota?.toString() ?? null,
          },
        },
      };
    }
    return org;
  }

  async updateOrganization(organizationId: string, data: { name?: string }) {
    return this.prisma.subscriberOrganization.update({
      where: { id: organizationId },
      data,
    });
  }

  async listMembers(organizationId: string) {
    return this.prisma.subscriberMembership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { invitedAt: 'asc' },
    });
  }

  async updateMemberRole(
    organizationId: string,
    membershipId: string,
    role: SubscriberOrgRole,
    actorUserId: string,
  ) {
    const membership = await this.prisma.subscriberMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.organizationId !== organizationId) {
      throw new NotFoundException('Membership not found');
    }
    // Granting or revoking OWNER is an ownership-transfer action -- an ADMIN
    // (who can otherwise manage members) must never be able to promote
    // themselves or anyone else to OWNER, or demote an existing OWNER, since
    // OWNER unlocks billing, security policy, and SSO break-glass login.
    if (role === SubscriberOrgRole.OWNER || membership.role === SubscriberOrgRole.OWNER) {
      await this.assertActorIsOwner(organizationId, actorUserId);
    }
    if (membership.role === SubscriberOrgRole.OWNER && role !== SubscriberOrgRole.OWNER) {
      await this.assertNotLastOwner(organizationId, membershipId);
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.subscriberMembership.update({ where: { id: membershipId }, data: { role } }),
      // orgRole is baked into the access token's claims -- without this, a
      // demoted user keeps acting at their old (higher) privilege level for
      // up to the token's remaining TTL. Same tradeoff as removeMember: this
      // signs the user out of every org, not just this one, since refresh
      // tokens aren't org-scoped.
      this.prisma.subscriberRefreshToken.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    void this.orgActivity.record(organizationId, ActivityEventType.MEMBER_ROLE_CHANGED, actorUserId, {
      targetUserId: updated.userId,
      oldRole: membership.role,
      newRole: role,
    });
    return updated;
  }

  async removeMember(organizationId: string, membershipId: string, actorUserId: string) {
    const membership = await this.prisma.subscriberMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.organizationId !== organizationId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.role === SubscriberOrgRole.OWNER) {
      // Removing an OWNER is equivalent to an involuntary ownership change --
      // an ADMIN must not be able to do this to another OWNER.
      await this.assertActorIsOwner(organizationId, actorUserId);
      await this.assertNotLastOwner(organizationId, membershipId);
    }
    await this.prisma.$transaction([
      this.prisma.subscriberMembership.delete({ where: { id: membershipId } }),
      // A stateless-JWT access token issued before removal would otherwise
      // keep authorizing this org's endpoints for up to its own TTL --
      // revoking every refresh token forces re-login (and re-derivation of
      // org membership) immediately, same as resetPassword's revocation.
      // Refresh tokens aren't org-scoped (SubscriberRefreshToken has no
      // organizationId), so this signs the user out of every org they
      // belong to, not just this one -- an acceptable cost for immediate
      // effect, and consistent with Phase 1 having no mid-session org switch.
      this.prisma.subscriberRefreshToken.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    void this.orgActivity.record(organizationId, ActivityEventType.MEMBER_REMOVED, actorUserId, {
      targetUserId: membership.userId,
    });
  }

  async listPendingInvites(organizationId: string) {
    return this.prisma.subscriberInvite.findMany({
      where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        invitedByUserId: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Recent Access Changes feed -- reads OrgActivityEvent, which
   * inviteMember/updateMemberRole/removeMember already write to (see
   * OrgActivityService.record's call sites). actorUserId has no FK relation
   * (it's null for system-initiated events), so actor names are resolved
   * here in a second query rather than via Prisma `include`.
   */
  async listActivity(organizationId: string, limit = 20) {
    const events = await this.prisma.orgActivityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => id !== null))];
    const actors = actorIds.length
      ? await this.prisma.subscriberUser.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorsById = new Map(actors.map((a) => [a.id, a]));
    return events.map((event) => ({
      ...event,
      actor: event.actorUserId ? (actorsById.get(event.actorUserId) ?? null) : null,
    }));
  }

  private async assertNotLastOwner(organizationId: string, excludingMembershipId: string) {
    const otherOwners = await this.prisma.subscriberMembership.count({
      where: {
        organizationId,
        role: SubscriberOrgRole.OWNER,
        id: { not: excludingMembershipId },
      },
    });
    if (otherOwners === 0) {
      throw new ForbiddenException('An organization must always have at least one owner');
    }
  }

  private async assertActorIsOwner(organizationId: string, actorUserId: string) {
    const actorMembership = await this.prisma.subscriberMembership.findFirst({
      where: { organizationId, userId: actorUserId },
    });
    if (actorMembership?.role !== SubscriberOrgRole.OWNER) {
      throw new ForbiddenException('Only an owner can grant or revoke owner access');
    }
  }
}
