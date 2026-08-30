import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateCampaignShareDto } from './dto/create-campaign-share.dto';
import { MarketingFormatQueryDto } from './dto/marketing-format-query.dto';
import { MarketingService } from './marketing.service';

@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('materials')
  @UseGuards(JwtAuthGuard)
  listMaterials(@Query() query: MarketingFormatQueryDto) {
    return this.marketing.listMaterials(query.format);
  }

  @Post('shares')
  @UseGuards(JwtAuthGuard)
  createShare(@Req() req: AuthenticatedRequest, @Body() dto: CreateCampaignShareDto) {
    return this.marketing.getOrCreateShare(req.user.sub, dto);
  }

  @Get('shares/mine')
  @UseGuards(JwtAuthGuard)
  listMyShares(@Req() req: AuthenticatedRequest) {
    return this.marketing.listMyShares(req.user.sub);
  }

  /**
   * Unauthenticated -- powers the invite page's generateMetadata (fetched
   * server-side, see frontend/app/invite/[code]/[campaign]/page.tsx) and
   * folds in a best-effort view count on every call.
   */
  @Get('shares/:id/headline')
  getShareForInvite(@Param('id') id: string) {
    return this.marketing.getShareForInvite(id);
  }
}
