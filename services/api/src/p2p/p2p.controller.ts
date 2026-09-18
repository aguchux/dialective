import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { P2PService } from './p2p.service';
import { P2PChatService } from './p2p-chat.service';
import {
  AcceptOfferDto,
  CreateOfferDto,
  ListDisputesDto,
  ListOffersDto,
  ListTradesDto,
  RequestP2pTradeOtpDto,
  RaiseDisputeDto,
  ResolveDisputeDto,
  UpdateOfferDto,
  UpdateP2PMarketSettingsDto,
  UpdateP2pPaymentInstructionsDto,
} from './dto/p2p.dto';
import { CreateP2PChatUploadUrlDto, SendP2PTradeMessageDto } from './dto/p2p-chat.dto';

@Controller('p2p')
@UseGuards(JwtAuthGuard)
export class P2PController {
  constructor(
    private readonly p2p: P2PService,
    private readonly chat: P2PChatService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.p2p.getSettings();
  }

  /** What the caller may do on the market -- advisory; the gates are enforced on the actions themselves. */
  @Get('eligibility')
  getTradingEligibility(@Req() req: AuthenticatedRequest) {
    return this.p2p.getTradingEligibility(req.user.sub);
  }

  @Get('reference-rate')
  getReferenceRate(@Req() req: AuthenticatedRequest) {
    return this.p2p.getReferenceRate(req.user.sub);
  }

  @Get('payment-instructions')
  getPaymentInstructions(@Req() req: AuthenticatedRequest) {
    return this.p2p.getP2pPaymentInstructions(req.user.sub);
  }

  @Patch('payment-instructions')
  updatePaymentInstructions(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateP2pPaymentInstructionsDto,
  ) {
    return this.p2p.updateP2pPaymentInstructions(req.user.sub, body);
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

  // Declared AFTER 'offers/mine' -- Nest matches in declaration order, so a
  // ':id' route above it would swallow /offers/mine as an offer id.
  @Get('offers/:id')
  getOfferDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.getOfferDetail(req.user.sub, id);
  }

  @Post('offers/otp')
  requestTradeOtp(@Req() req: AuthenticatedRequest, @Body() body: RequestP2pTradeOtpDto) {
    return this.p2p.requestTradeOtp(req.user.sub, body);
  }

  @Post('offers')
  createOffer(@Req() req: AuthenticatedRequest, @Body() body: CreateOfferDto) {
    return this.p2p.createOffer(req.user.sub, body);
  }

  @Post('offers/:id/accept')
  acceptOffer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AcceptOfferDto,
  ) {
    return this.p2p.acceptOffer(req.user.sub, id, body);
  }

  @Post('offers/:id/cancel')
  cancelOffer(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.cancelOffer(req.user.sub, id);
  }

  @Patch('offers/:id')
  updateOffer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateOfferDto,
  ) {
    return this.p2p.updateOffer(req.user.sub, id, body);
  }

  @Delete('offers/:id')
  deleteOffer(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.deleteOffer(req.user.sub, id);
  }

  @Get('trades/mine')
  listMyTrades(@Req() req: AuthenticatedRequest, @Query() query: ListTradesDto) {
    return this.p2p.listMyTrades(req.user.sub, query);
  }

  // Same ordering rule as offers/:id -- must follow 'trades/mine'.
  @Get('trades/:id')
  getTradeDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.p2p.getTradeDetail(req.user.sub, id);
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
  raiseDispute(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RaiseDisputeDto,
  ) {
    return this.p2p.raiseDispute(req.user.sub, id, body);
  }

  @Get('trades/:id/messages')
  listMessages(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.chat.listMessages(req.user.sub, req.user.role, id);
  }

  @Post('trades/:id/messages')
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SendP2PTradeMessageDto,
  ) {
    return this.chat.sendMessage(req.user.sub, req.user.role, id, body);
  }

  @Post('trades/:id/messages/upload-url')
  createChatUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateP2PChatUploadUrlDto,
  ) {
    return this.chat.createUploadUrl(req.user.sub, req.user.role, id, body);
  }

  @Get('trades/:id/messages/:messageId/attachment')
  getAttachmentDownloadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chat.attachmentDownloadUrl(req.user.sub, req.user.role, id, messageId);
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
  adminResolveDispute(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ResolveDisputeDto,
  ) {
    return this.p2p.resolveDispute(req.user.sub, id, body);
  }
}
