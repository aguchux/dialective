import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { P2PService } from './p2p.service';
import {
  AcceptOfferDto,
  CreateOfferDto,
  ListDisputesDto,
  ListOffersDto,
  ListTradesDto,
  RequestPaymentMethodOtpDto,
  RaiseDisputeDto,
  ResolveDisputeDto,
  UpdateP2PMarketSettingsDto,
  UpsertPaymentMethodDto,
} from './dto/p2p.dto';

@Controller('p2p')
@UseGuards(JwtAuthGuard)
export class P2PController {
  constructor(private readonly p2p: P2PService) {}

  @Get('settings')
  getSettings() {
    return this.p2p.getSettings();
  }

  @Get('reference-rate')
  getReferenceRate(@Req() req: AuthenticatedRequest) {
    return this.p2p.getReferenceRate(req.user.sub);
  }

  @Get('payment-methods')
  listPaymentMethods(@Req() req: AuthenticatedRequest) {
    return this.p2p.listPaymentMethods(req.user.sub);
  }

  @Post('payment-methods/otp')
  requestPaymentMethodOtp(@Req() req: AuthenticatedRequest, @Body() body: RequestPaymentMethodOtpDto) {
    return this.p2p.requestPaymentMethodOtp(req.user.sub, body);
  }

  @Post('payment-methods')
  createPaymentMethod(@Req() req: AuthenticatedRequest, @Body() body: UpsertPaymentMethodDto) {
    return this.p2p.createPaymentMethod(req.user.sub, body);
  }

  @Patch('payment-methods/:id')
  updatePaymentMethod(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpsertPaymentMethodDto) {
    return this.p2p.updatePaymentMethod(req.user.sub, id, body);
  }

  @Get('offers')
  listOffers(@Req() req: AuthenticatedRequest, @Query() query: ListOffersDto) {
    return this.p2p.listOffers(req.user.sub, query);
  }

  @Get('traders/:userId')
  getTraderProfile(@Param('userId') userId: string) {
    return this.p2p.getTraderProfile(userId);
  }

  @Get('offers/mine')
  listMyOffers(@Req() req: AuthenticatedRequest) {
    return this.p2p.listMyOffers(req.user.sub);
  }

  @Post('offers')
  createOffer(@Req() req: AuthenticatedRequest, @Body() body: CreateOfferDto) {
    return this.p2p.createOffer(req.user.sub, body);
  }

  @Post('offers/:id/accept')
  acceptOffer(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: AcceptOfferDto) {
    return this.p2p.acceptOffer(req.user.sub, id, body);
  }

  @Post('offers/:id/cancel')
  cancelOffer(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.cancelOffer(req.user.sub, id);
  }

  @Get('trades/mine')
  listMyTrades(@Req() req: AuthenticatedRequest, @Query() query: ListTradesDto) {
    return this.p2p.listMyTrades(req.user.sub, query);
  }

  @Post('trades/:id/mark-paid')
  markPaid(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.markPaid(req.user.sub, id);
  }

  @Post('trades/:id/request-cancel')
  requestCancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.requestCancel(req.user.sub, id);
  }

  @Post('trades/:id/release')
  release(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.release(req.user.sub, id);
  }

  @Post('trades/:id/dispute')
  raiseDispute(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: RaiseDisputeDto) {
    return this.p2p.raiseDispute(req.user.sub, id, body);
  }

  @Get('admin/settings')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminGetSettings() {
    return this.p2p.getSettings();
  }

  @Patch('admin/settings')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminUpdateSettings(@Body() body: UpdateP2PMarketSettingsDto) {
    return this.p2p.updateSettings(body);
  }

  @Get('admin/trades')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminListTrades(@Query() query: ListTradesDto) {
    return this.p2p.adminListTrades(query);
  }

  @Get('admin/disputes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminListDisputes(@Query() query: ListDisputesDto) {
    return this.p2p.adminListDisputes(query);
  }

  @Post('admin/disputes/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminResolveDispute(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ResolveDisputeDto) {
    return this.p2p.resolveDispute(req.user.sub, id, body);
  }
}
