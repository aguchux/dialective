import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';

/** Same role set as Stream Keys (stream-keys.controller.ts's CAN_MANAGE_KEYS) -- webhook subscriptions are programmatic-integration configuration, the same category as API keys. */
const CAN_MANAGE_WEBHOOKS = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
  SubscriberOrgRole.API_DEVELOPER,
];

@Controller('voice-stream/webhooks')
@UseGuards(SubscriberAuthGuard)
export class WebhookSubscriptionsController {
  constructor(private readonly webhooks: WebhookSubscriptionsService) {}

  @Get()
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_WEBHOOKS)
  list(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.webhooks.list(subscriber.organizationId);
  }

  @Post()
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_WEBHOOKS)
  create(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: CreateWebhookSubscriptionDto,
  ) {
    return this.webhooks.create(subscriber.organizationId, subscriber.sub, dto);
  }

  @Delete(':id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_WEBHOOKS)
  async remove(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims, @Param('id') id: string) {
    await this.webhooks.remove(subscriber.organizationId, id);
    return { removed: true };
  }

  @Get(':id/deliveries')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_WEBHOOKS)
  listDeliveries(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.webhooks.listDeliveries(subscriber.organizationId, id);
  }
}
