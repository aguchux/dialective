import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriberOrgsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.subscriberOrganization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { subscription: { include: { plan: true } } },
    });
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

  async updateMemberRole(organizationId: string, membershipId: string, role: SubscriberOrgRole) {
    const membership = await this.prisma.subscriberMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.organizationId !== organizationId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.role === SubscriberOrgRole.OWNER && role !== SubscriberOrgRole.OWNER) {
      await this.assertNotLastOwner(organizationId, membershipId);
    }
    return this.prisma.subscriberMembership.update({
      where: { id: membershipId },
      data: { role },
    });
  }

  async removeMember(organizationId: string, membershipId: string) {
    const membership = await this.prisma.subscriberMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.organizationId !== organizationId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.role === SubscriberOrgRole.OWNER) {
      await this.assertNotLastOwner(organizationId, membershipId);
    }
    await this.prisma.subscriberMembership.delete({ where: { id: membershipId } });
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
}
