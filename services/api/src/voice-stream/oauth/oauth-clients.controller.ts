import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { RequireActiveSubscriptionGuard } from '../billing/require-active-subscription.guard';
import { OAuthClientsService } from './oauth-clients.service';
import { CreateOAuthClientDto } from './dto/create-oauth-client.dto';

/** Same role set as Stream Key management (stream-keys.controller.ts) -- programmatic-integration configuration, same category. */
const CAN_MANAGE_CLIENTS = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
  SubscriberOrgRole.API_DEVELOPER,
];

@Controller('voice-stream/oauth/clients')
@UseGuards(SubscriberAuthGuard)
export class OAuthClientsController {
  constructor(private readonly clients: OAuthClientsService) {}

  @Get()
  list(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.clients.list(subscriber.organizationId);
  }

  @Post()
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard)
  @SubscriberRoles(...CAN_MANAGE_CLIENTS)
  create(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: CreateOAuthClientDto,
  ) {
    return this.clients.create(subscriber.organizationId, subscriber.sub, dto);
  }

  @Delete(':id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_CLIENTS)
  revoke(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims, @Param('id') id: string) {
    return this.clients.revoke(subscriber.organizationId, id, subscriber.sub);
  }
}
