import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ActivityEventType, SubscriberOrgRole } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgActivityService } from '../org-activity/org-activity.service';
import { CreateSsoIdpConfigDto } from './dto/create-sso-idp-config.dto';
import { UpdateSsoIdpConfigDto } from './dto/update-sso-idp-config.dto';

function assertRoleIsNotOwner(role: SubscriberOrgRole | undefined): void {
  // JIT-provisioning an unknown, IdP-asserted identity straight to OWNER
  // would let anyone who can sign an assertion for the configured IdP seize
  // full control of the organization -- never allowed, regardless of who
  // configures the IdP.
  if (role === SubscriberOrgRole.OWNER) {
    throw new BadRequestException('defaultRole cannot be OWNER');
  }
}

/**
 * Dashboard-side (JWT-authenticated, human) CRUD for SsoIdpConfig rows --
 * distinct from SsoService, which validates assertions and performs JIT
 * provisioning. Exact template: oauth-clients.service.ts.
 */
@Injectable()
export class SsoIdpConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  async get(organizationId: string) {
    const config = await this.prisma.ssoIdpConfig.findUnique({ where: { organizationId } });
    if (!config) {
      throw new NotFoundException('No SSO configuration found for this organization');
    }
    return config;
  }

  async create(organizationId: string, createdByUserId: string, dto: CreateSsoIdpConfigDto) {
    assertRoleIsNotOwner(dto.defaultRole);

    const existing = await this.prisma.ssoIdpConfig.findUnique({ where: { organizationId } });
    if (existing) {
      throw new ConflictException(
        'This organization already has an SSO configuration -- update or delete it first',
      );
    }

    const config = await this.prisma.ssoIdpConfig.create({
      data: {
        organizationId,
        idpEntityId: dto.idpEntityId,
        idpSsoUrl: dto.idpSsoUrl,
        idpCertificate: dto.idpCertificate,
        spEntityId: randomUUID(),
        ...(dto.nameIdFormat ? { nameIdFormat: dto.nameIdFormat } : {}),
        ...(dto.emailAttribute ? { emailAttribute: dto.emailAttribute } : {}),
        ...(dto.firstNameAttribute ? { firstNameAttribute: dto.firstNameAttribute } : {}),
        ...(dto.lastNameAttribute ? { lastNameAttribute: dto.lastNameAttribute } : {}),
        ...(dto.defaultRole ? { defaultRole: dto.defaultRole } : {}),
        createdByUserId,
      },
    });

    void this.orgActivity.record(
      organizationId,
      ActivityEventType.SSO_CONFIGURED,
      createdByUserId,
      {
        idpEntityId: config.idpEntityId,
      },
    );

    return config;
  }

  async update(organizationId: string, actorUserId: string, dto: UpdateSsoIdpConfigDto) {
    assertRoleIsNotOwner(dto.defaultRole);

    const existing = await this.prisma.ssoIdpConfig.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new NotFoundException('No SSO configuration found for this organization');
    }

    const config = await this.prisma.ssoIdpConfig.update({
      where: { organizationId },
      data: dto,
    });

    void this.orgActivity.record(organizationId, ActivityEventType.SSO_CONFIGURED, actorUserId, {
      idpEntityId: config.idpEntityId,
      updated: true,
    });

    return config;
  }

  async remove(organizationId: string, actorUserId: string) {
    const existing = await this.prisma.ssoIdpConfig.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new NotFoundException('No SSO configuration found for this organization');
    }

    await this.prisma.ssoIdpConfig.delete({ where: { organizationId } });

    void this.orgActivity.record(organizationId, ActivityEventType.SSO_DISABLED, actorUserId, {
      idpEntityId: existing.idpEntityId,
    });
  }
}
