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
