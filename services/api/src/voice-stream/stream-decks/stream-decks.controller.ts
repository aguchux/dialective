import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { RequireActiveSubscriptionGuard } from '../billing/require-active-subscription.guard';
import { StreamDecksService } from './stream-decks.service';
import { PublicDecksService } from './public-decks.service';
import { CreateStreamDeckDto } from './dto/create-stream-deck.dto';
import { UpdateStreamDeckDto } from './dto/update-stream-deck.dto';
import { AddStreamDeckItemDto } from './dto/add-stream-deck-item.dto';
import { StreamDeckRuleDto } from './dto/stream-deck-rule.dto';
import { SetDeckVisibilityDto } from './dto/set-deck-visibility.dto';
import { SetDeckLicenseDto } from './dto/set-deck-license.dto';

const CAN_MANAGE_DECKS = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
];

@Controller('voice-stream/stream-decks')
@UseGuards(SubscriberAuthGuard)
export class StreamDecksController {
  constructor(
    private readonly decks: StreamDecksService,
    private readonly publicDecks: PublicDecksService,
  ) {}

  @Post()
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  create(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: CreateStreamDeckDto,
  ) {
    return this.decks.create(subscriber.organizationId, subscriber.sub, dto);
  }

  @Get()
  list(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.decks.list(subscriber.organizationId);
  }

  @Get(':id')
  get(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims, @Param('id') id: string) {
    return this.decks.get(subscriber.organizationId, id);
  }

  @Patch(':id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  rename(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateStreamDeckDto,
  ) {
    return this.decks.rename(subscriber.organizationId, id, subscriber.sub, dto.name);
  }

  @Delete(':id')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  remove(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims, @Param('id') id: string) {
    return this.decks.remove(subscriber.organizationId, id, subscriber.sub);
  }

  @Post(':id/items')
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  addItem(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: AddStreamDeckItemDto,
  ) {
    return this.decks.addItem(subscriber.organizationId, id, subscriber.sub, dto.recordingId);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  removeItem(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.decks.removeItem(subscriber.organizationId, id, subscriber.sub, itemId);
  }

  @Patch(':id/rule')
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  updateRule(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: StreamDeckRuleDto,
  ) {
    return this.decks.updateRule(subscriber.organizationId, id, dto);
  }

  @Get(':id/versions')
  listVersions(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.decks.listVersions(subscriber.organizationId, id);
  }

  @Patch(':id/visibility')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  setVisibility(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: SetDeckVisibilityDto,
  ) {
    return this.publicDecks.setVisibility(
      subscriber.organizationId,
      id,
      subscriber.sub,
      dto.visibility,
    );
  }

  @Post(':id/license')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  setLicense(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: SetDeckLicenseDto,
  ) {
    return this.publicDecks.setLicense(subscriber.organizationId, id, subscriber.sub, dto);
  }

  @Delete(':id/license')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  removeLicense(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.publicDecks.removeLicense(subscriber.organizationId, id);
  }
}
