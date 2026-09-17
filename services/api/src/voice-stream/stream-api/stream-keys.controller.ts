import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { RequireActiveSubscriptionGuard } from '../billing/require-active-subscription.guard';
import { ApiKeyRolePolicyGuard } from '../security-policy/api-key-role-policy.guard';
import { StreamKeysService } from './stream-keys.service';
import { CreateStreamKeyDto } from './dto/create-stream-key.dto';
import { RotateStreamKeyDto } from './dto/rotate-stream-key.dto';

/** API_DEVELOPER is the role reserved for Stream Key management (SubscriberOrgRole's own doc comment: "reserved, no-op until Phase 3"), alongside the roles that already manage decks -- minting a key is a data-access-granting action, not open to VALIDATOR/BILLING_MANAGER/AUDITOR. */
const CAN_MANAGE_KEYS = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
  SubscriberOrgRole.API_DEVELOPER,
];

@Controller('voice-stream/stream-keys')
@UseGuards(SubscriberAuthGuard)
export class StreamKeysController {
  constructor(private readonly keys: StreamKeysService) {}

  @Get()
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_KEYS)
  list(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.keys.list(subscriber.organizationId);
  }

  @Post()
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard, ApiKeyRolePolicyGuard)
  @SubscriberRoles(...CAN_MANAGE_KEYS)
  create(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: CreateStreamKeyDto,
  ) {
    return this.keys.create(subscriber.organizationId, subscriber.sub, dto);
  }

  @Post(':id/rotate')
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard, ApiKeyRolePolicyGuard)
  @SubscriberRoles(...CAN_MANAGE_KEYS)
  rotate(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: RotateStreamKeyDto,
  ) {
    return this.keys.rotate(subscriber.organizationId, id, subscriber.sub, dto.allowedIps);
  }

  @Delete(':id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_KEYS)
  revoke(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims, @Param('id') id: string) {
    return this.keys.revoke(subscriber.organizationId, id, subscriber.sub);
  }
}
