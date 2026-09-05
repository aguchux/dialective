import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { SecurityPolicyEntitlementGuard } from './security-policy-entitlement.guard';
import { SecurityPolicyService } from './security-policy.service';
import { UpsertSecurityPolicyDto } from './dto/upsert-security-policy.dto';

/** Security policy changes who can log in and how -- restricted to OWNER/ADMIN only, matching sso-idp-config.controller.ts's CAN_MANAGE_SSO posture. */
const CAN_MANAGE_SECURITY_POLICY = [SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN];

@Controller('voice-stream/security-policy')
@UseGuards(SubscriberAuthGuard)
export class SecurityPolicyController {
  constructor(private readonly policy: SecurityPolicyService) {}

  // GET deliberately omits SecurityPolicyEntitlementGuard: an OWNER/ADMIN
  // must still be able to *view* the currently-configured policy (e.g. after
  // a downgrade drops enterprise entitlement) even if the plan can no longer
  // create/change/remove one -- read access is intentionally less
  // restrictive here. Mutation (POST/DELETE) must not be.
  @Get()
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_SECURITY_POLICY)
  get(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.policy.get(subscriber.organizationId);
  }

  @Post()
  @UseGuards(SubscriberRolesGuard, SecurityPolicyEntitlementGuard)
  @SubscriberRoles(...CAN_MANAGE_SECURITY_POLICY)
  upsert(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: UpsertSecurityPolicyDto,
  ) {
    return this.policy.upsert(subscriber.organizationId, subscriber.sub, dto);
  }

  // Must carry the same SecurityPolicyEntitlementGuard as POST -- DELETE is a
  // mutation of the same enterprise-gated resource and must never be less
  // protected than the route that creates it.
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SubscriberRolesGuard, SecurityPolicyEntitlementGuard)
  @SubscriberRoles(...CAN_MANAGE_SECURITY_POLICY)
  async remove(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims): Promise<void> {
    await this.policy.remove(subscriber.organizationId, subscriber.sub);
  }
}
