import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { RequireActiveSubscriptionGuard } from '../billing/require-active-subscription.guard';
import { TierGateGuard, TierGatedRequest } from '../billing/tier-gate.guard';
import { CatalogueService } from './catalogue.service';
import { SearchCatalogueDto } from './dto/search-catalogue.dto';

@Controller('voice-stream/catalogue')
@UseGuards(SubscriberAuthGuard, TierGateGuard)
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('search')
  search(@Query() query: SearchCatalogueDto, @Req() request: TierGatedRequest) {
    return this.catalogue.search({
      countryCode: query.countryCode,
      dialectTag: query.dialectTag,
      minScore: query.minScore,
      minIsvs: query.minIsvs,
      minConfidence: query.minConfidence,
      planMinConfidence: request.planMinConfidence,
      sortBy: query.sortBy,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  /**
   * Per-dialect coverage for the subscriber app's showcase.
   *
   * Declared BEFORE `:recordingId/preview` -- Nest matches routes in
   * declaration order, so a later `collections` would be swallowed by the
   * parameterised route and arrive as a preview request for a recording named
   * "collections".
   *
   * No RequireActiveSubscriptionGuard: this is the surface a subscriber sees
   * while deciding whether to subscribe, so gating it on an active
   * subscription would make it permanently empty for exactly the audience it
   * is for. It exposes aggregate counts only, never a recording id or
   * contributor identity, so there is nothing here to withhold behind payment.
   */
  @Get('collections')
  collections() {
    return this.catalogue.collections();
  }

  @Get(':recordingId/preview')
  @UseGuards(RequireActiveSubscriptionGuard)
  preview(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('recordingId') recordingId: string,
    @Req() request: TierGatedRequest,
  ) {
    return this.catalogue.preview(
      subscriber.organizationId,
      subscriber.sub,
      recordingId,
      request.planMinConfidence,
    );
  }
}
