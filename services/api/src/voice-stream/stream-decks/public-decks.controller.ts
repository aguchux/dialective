import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { RequireActiveSubscriptionGuard } from '../billing/require-active-subscription.guard';
import { QualityTier } from '../catalogue/catalogue.service';
import { PublicDecksService } from './public-decks.service';
import { CopyPublicDeckDto } from './dto/copy-public-deck.dto';

const CAN_MANAGE_DECKS = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
];

const CAN_VALIDATE = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
  SubscriberOrgRole.VALIDATOR,
];

/**
 * Cross-org browsing of PUBLIC Stream Decks -- deliberately a separate
 * controller from StreamDecksController, since every route here reads or
 * acts on a deck the caller does NOT own (StreamDecksController's routes
 * are always caller-owned-deck-scoped). See PublicDecksService's doc
 * comment for the confirmed access boundary: browse + copy + queue only,
 * never manifest/audio streaming.
 */
@Controller('voice-stream/public-decks')
@UseGuards(SubscriberAuthGuard)
export class PublicDecksController {
  constructor(private readonly publicDecks: PublicDecksService) {}

  @Get()
  listPublic(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query('minQualityTier') minQualityTier?: QualityTier,
  ) {
    return this.publicDecks.listPublic(subscriber.organizationId, minQualityTier);
  }

  @Post(':id/accept-license')
  acceptLicense(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.publicDecks.acceptLicense(subscriber.organizationId, subscriber.sub, id);
  }

  @Post(':id/copy-to-mine')
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard)
  @SubscriberRoles(...CAN_MANAGE_DECKS)
  copyToMine(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: CopyPublicDeckDto,
  ) {
    return this.publicDecks.copyToOwnDeck(subscriber.organizationId, subscriber.sub, id, dto.newDeckName);
  }

  @Post(':id/import-to-validation-queue')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_VALIDATE)
  importToValidationQueue(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.publicDecks.importToValidationQueue(subscriber.organizationId, subscriber.sub, id);
  }

  @Get('validation-queue')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_VALIDATE)
  listValidationQueue(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.publicDecks.listValidationQueue(subscriber.organizationId);
  }

  @Delete('validation-queue/:itemId')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_VALIDATE)
  removeFromValidationQueue(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('itemId') itemId: string,
  ) {
    return this.publicDecks.removeFromValidationQueue(subscriber.organizationId, itemId);
  }
}
