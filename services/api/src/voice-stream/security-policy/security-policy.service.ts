import { Injectable } from '@nestjs/common';
import { ActivityEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgActivityService } from '../org-activity/org-activity.service';
import { UpsertSecurityPolicyDto } from './dto/upsert-security-policy.dto';

/**
 * Dashboard-side (JWT-authenticated, human) CRUD for
 * SubscriberOrgSecurityPolicy -- upsert rather than a create/update split
 * (unlike sso-idp-config.service.ts) since this is a single-record
 * toggle-bag, not incrementally-built config.
 */
@Injectable()
export class SecurityPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  async get(organizationId: string) {
    return this.prisma.subscriberOrgSecurityPolicy.findUnique({ where: { organizationId } });
  }

  async upsert(organizationId: string, actorUserId: string, dto: UpsertSecurityPolicyDto) {
    const policy = await this.prisma.subscriberOrgSecurityPolicy.upsert({
      where: { organizationId },
      create: { organizationId, createdByUserId: actorUserId, ...dto },
      update: dto,
    });
    void this.orgActivity.record(
      organizationId,
      ActivityEventType.SECURITY_POLICY_UPDATED,
      actorUserId,
      { ...dto },
    );
    return policy;
  }

  async remove(organizationId: string, actorUserId: string) {
    await this.prisma.subscriberOrgSecurityPolicy.delete({ where: { organizationId } });
    void this.orgActivity.record(
      organizationId,
      ActivityEventType.SECURITY_POLICY_REMOVED,
      actorUserId,
      {},
    );
  }
}
