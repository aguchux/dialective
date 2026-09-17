import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { SubscriberOrgsService } from './subscriber-orgs.service';
import { UpdateSubscriberOrganizationDto } from './dto/update-subscriber-organization.dto';
import { UpdateSubscriberMemberRoleDto } from './dto/update-subscriber-member-role.dto';

@Controller('voice-stream')
@UseGuards(SubscriberAuthGuard)
export class SubscriberOrgsController {
  constructor(private readonly orgs: SubscriberOrgsService) {}

  @Get('me')
  me(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.orgs.getMe(subscriber.sub);
  }

  @Get('organization')
  getOrganization(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.orgs.getOrganization(subscriber.organizationId);
  }

  @Patch('organization')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  updateOrganization(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: UpdateSubscriberOrganizationDto,
  ) {
    return this.orgs.updateOrganization(subscriber.organizationId, dto);
  }

  @Get('organization/members')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  listMembers(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.orgs.listMembers(subscriber.organizationId);
  }

  @Get('organization/invites')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  listPendingInvites(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.orgs.listPendingInvites(subscriber.organizationId);
  }

  @Get('organization/activity')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  listActivity(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.orgs.listActivity(subscriber.organizationId);
  }

  @Patch('organization/members/:id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  updateMemberRole(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') membershipId: string,
    @Body() dto: UpdateSubscriberMemberRoleDto,
  ) {
    return this.orgs.updateMemberRole(
      subscriber.organizationId,
      membershipId,
      dto.role,
      subscriber.sub,
    );
  }

  @Delete('organization/members/:id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  removeMember(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') membershipId: string,
  ) {
    return this.orgs.removeMember(subscriber.organizationId, membershipId, subscriber.sub);
  }
}
