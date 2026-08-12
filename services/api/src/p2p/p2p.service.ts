import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LedgerEntryType,
  OtpPurpose,
  P2PDisputeStatus,
  P2POfferStatus,
  P2POfferType,
  P2PTradeStatus,
  Prisma,
} from '@dialectiva/db';
import { randomUUID } from 'crypto';
import { OtpService } from '../otp/otp.service';
import { PrismaService } from '../prisma/prisma.service';
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
import { paymentMethodContextHash } from './p2p-otp-context.util';

const OPEN_OFFER_STATUSES = [P2POfferStatus.ACTIVE, P2POfferStatus.RESERVED];
const OPEN_TRADE_STATUSES = [P2PTradeStatus.AWAITING_PAYMENT, P2PTradeStatus.PAID_MARKED, P2PTradeStatus.CANCEL_PENDING];

@Injectable()
export class P2PService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  async getSettings() {
    const row = await this.settingsRow();
    return serializeSettings(row);
  }

  async updateSettings(dto: UpdateP2PMarketSettingsDto) {
    if (dto.minTradeTokens !== undefined && dto.maxTradeTokens !== undefined && dto.minTradeTokens > dto.maxTradeTokens) {
      throw new BadRequestException('minTradeTokens cannot be greater than maxTradeTokens');
    }
    const row = await this.prisma.p2PMarketSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...dto },
      update: dto,
    });
    return serializeSettings(row);
  }

  async listPaymentMethods(userId: string) {
    return this.prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async requestPaymentMethodOtp(userId: string, dto: RequestPaymentMethodOtpDto) {
    if (dto.id) {
      const method = await this.prisma.userPaymentMethod.findFirst({ where: { id: dto.id, userId }, select: { id: true } });
      if (!method) throw new NotFoundException('Payment method not found');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return this.otp.issueForUser(userId, OtpPurpose.P2P_PAYMENT_METHOD, user.email, paymentMethodContextHash(dto));
  }

  async createPaymentMethod(userId: string, dto: UpsertPaymentMethodDto) {
    await this.verifyPaymentMethodOtp(userId, dto);
    return this.prisma.userPaymentMethod.create({
      data: {
        userId,
        ...paymentMethodData(dto),
        enabled: dto.enabled ?? true,
      },
    });
  }

  async updatePaymentMethod(userId: string, id: string, dto: UpsertPaymentMethodDto) {
    const method = await this.prisma.userPaymentMethod.findFirst({ where: { id, userId } });
    if (!method) throw new NotFoundException('Payment method not found');
    await this.verifyPaymentMethodOtp(userId, { ...dto, id });
    return this.prisma.userPaymentMethod.update({ where: { id }, data: paymentMethodData(dto) });
  }

  async createOffer(userId: string, dto: CreateOfferDto) {
    const settings = await this.requireMarketEnabled(dto.type);
    this.validateTradeInput(settings, dto.tokenAmount, dto.fiatCurrency, dto.paymentMethod);

    const openOffers = await this.prisma.p2PTokenOffer.count({
      where: { userId, status: { in: OPEN_OFFER_STATUSES } },
    });
    if (openOffers >= settings.maxOpenOffersPerUser) {
      throw new UnprocessableEntityException(`You can only keep ${settings.maxOpenOffersPerUser} open P2P offers`);
    }

    let paymentMethodId: string | undefined;
    if (dto.type === P2POfferType.SELL) {
      if (!dto.paymentMethodId) throw new BadRequestException('A seller payment method is required for sell offers');
      const method = await this.getEnabledPaymentMethod(userId, dto.paymentMethodId);
      paymentMethodId = method.id;
    }

    const offerId = randomUUID();
    const expiresInMinutes = Math.min(dto.expiresInMinutes ?? settings.offerExpiryMinutes, settings.offerExpiryMinutes);
    const expiresAt = addMinutes(new Date(), expiresInMinutes);

    if (dto.type === P2POfferType.BUY) {
      const offer = await this.prisma.p2PTokenOffer.create({
        data: {
          id: offerId,
          type: dto.type,
          userId,
          tokenAmount: dto.tokenAmount,
          remainingTokens: dto.tokenAmount,
          fiatAmount: dto.fiatAmount,
          fiatCurrency: dto.fiatCurrency,
          paymentMethod: dto.paymentMethod,
          expiresAt,
        },
      });
      return this.getOfferForUser(userId, offer.id);
    }

    const wallet = await this.prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: dto.tokenAmount } },
        data: { balance: { decrement: dto.tokenAmount }, lockedBalance: { increment: dto.tokenAmount } },
      });
      if (lock.count === 0) throw new UnprocessableEntityException('Insufficient spendable token balance');

      await tx.p2PTokenOffer.create({
        data: {
          id: offerId,
          type: dto.type,
          userId,
          tokenAmount: dto.tokenAmount,
          remainingTokens: dto.tokenAmount,
          fiatAmount: dto.fiatAmount,
          fiatCurrency: dto.fiatCurrency,
          paymentMethod: dto.paymentMethod,
          paymentMethodId,
          expiresAt,
        },
      });
      await tx.ledgerEntry.create({
        data: { walletId: wallet.id, type: LedgerEntryType.P2P_ESCROW_LOCK, amount: -dto.tokenAmount, reference: offerId },
      });
    });
    return this.getOfferForUser(userId, offerId);
  }

  async listOffers(userId: string, query: ListOffersDto) {
    await this.expireStaleRecords();
    const where: Prisma.P2PTokenOfferWhereInput = {
      status: query.status ?? P2POfferStatus.ACTIVE,
      ...(query.type ? { type: query.type } : {}),
    };
    const offers = await this.prisma.p2PTokenOffer.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return offers.map((offer) => serializeOffer(offer, offer.userId === userId));
  }

  async listMyOffers(userId: string) {
    await this.expireStaleRecords();
    const offers = await this.prisma.p2PTokenOffer.findMany({
      where: { userId },
      include: { paymentMethodRef: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return offers.map((offer) => serializeOffer(offer, true));
  }

  async cancelOffer(userId: string, offerId: string) {
    await this.expireStaleRecords();
    const offer = await this.prisma.p2PTokenOffer.findFirst({ where: { id: offerId, userId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== P2POfferStatus.ACTIVE) {
      throw new UnprocessableEntityException('Only active, unaccepted offers can be cancelled directly');
    }
    if (offer.type === P2POfferType.SELL) {
      await this.cancelSellOffer(offer.id, P2POfferStatus.CANCELLED);
    } else {
      await this.prisma.p2PTokenOffer.update({ where: { id: offer.id }, data: { status: P2POfferStatus.CANCELLED, cancelledAt: new Date() } });
    }
    return this.getOfferForUser(userId, offer.id);
  }

  async acceptOffer(userId: string, offerId: string, dto: AcceptOfferDto) {
    await this.expireStaleRecords();
    const offer = await this.prisma.p2PTokenOffer.findUnique({ where: { id: offerId }, include: { paymentMethodRef: true } });
    if (!offer || offer.status !== P2POfferStatus.ACTIVE || offer.expiresAt <= new Date()) {
      throw new NotFoundException('Active offer not found');
    }
    if (offer.userId === userId) throw new ForbiddenException('You cannot accept your own offer');

    const settings = await this.requireMarketEnabled(offer.type);
    await this.enforceOpenTradeLimit(userId, settings.maxOpenTradesPerUser);

    const tradeId = randomUUID();
    const paymentDeadlineAt = addMinutes(new Date(), settings.paymentWindowMinutes);

    if (offer.type === P2POfferType.SELL) {
      await this.prisma.$transaction([
        this.prisma.p2PTokenOffer.update({ where: { id: offer.id }, data: { status: P2POfferStatus.RESERVED } }),
        this.prisma.p2PTokenTrade.create({
          data: {
            id: tradeId,
            offerId: offer.id,
            buyerId: userId,
            sellerId: offer.userId,
            sellerPaymentMethodId: offer.paymentMethodId,
            tokenAmount: offer.tokenAmount,
            fiatAmount: offer.fiatAmount,
            fiatCurrency: offer.fiatCurrency,
            paymentMethod: offer.paymentMethod,
            paymentDeadlineAt,
          },
        }),
      ]);
      return this.getTradeForUser(userId, tradeId);
    }

    if (!dto.sellerPaymentMethodId) throw new BadRequestException('Seller payment method is required');
    const paymentMethod = await this.getEnabledPaymentMethod(userId, dto.sellerPaymentMethodId);
    const wallet = await this.prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: offer.tokenAmount } },
        data: { balance: { decrement: offer.tokenAmount }, lockedBalance: { increment: offer.tokenAmount } },
      });
      if (lock.count === 0) throw new UnprocessableEntityException('Insufficient spendable token balance');

      await tx.p2PTokenOffer.update({ where: { id: offer.id }, data: { status: P2POfferStatus.RESERVED } });
      await tx.p2PTokenTrade.create({
        data: {
          id: tradeId,
          offerId: offer.id,
          buyerId: offer.userId,
          sellerId: userId,
          sellerPaymentMethodId: paymentMethod.id,
          tokenAmount: offer.tokenAmount,
          fiatAmount: offer.fiatAmount,
          fiatCurrency: offer.fiatCurrency,
          paymentMethod: offer.paymentMethod,
          paymentDeadlineAt,
        },
      });
      await tx.ledgerEntry.create({
        data: { walletId: wallet.id, type: LedgerEntryType.P2P_ESCROW_LOCK, amount: -offer.tokenAmount, reference: tradeId },
      });
    });
    return this.getTradeForUser(userId, tradeId);
  }

  async listMyTrades(userId: string, query: ListTradesDto) {
    await this.expireStaleRecords();
    const trades = await this.prisma.p2PTokenTrade.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: tradeInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return trades.map((trade) => serializeTrade(trade, userId));
  }

  async markPaid(userId: string, tradeId: string) {
    await this.expireStaleRecords();
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.buyerId !== userId) throw new NotFoundException('Trade not found');
    if (trade.status !== P2PTradeStatus.AWAITING_PAYMENT && trade.status !== P2PTradeStatus.CANCEL_PENDING) {
      throw new UnprocessableEntityException('This trade can no longer be marked paid');
    }
    if (trade.paymentDeadlineAt < new Date()) throw new UnprocessableEntityException('Payment window has expired');
    await this.prisma.p2PTokenTrade.update({
      where: { id: tradeId },
      data: {
        status: P2PTradeStatus.PAID_MARKED,
        paidAt: new Date(),
        cancelRequestedByUserId: null,
        cancelAvailableAt: null,
      },
    });
    return this.getTradeForUser(userId, tradeId);
  }

  async requestCancel(userId: string, tradeId: string) {
    await this.expireStaleRecords();
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId } });
    if (!trade || (trade.buyerId !== userId && trade.sellerId !== userId)) throw new NotFoundException('Trade not found');
    if (trade.status === P2PTradeStatus.PAID_MARKED) {
      throw new UnprocessableEntityException('Paid trades cannot be cancelled; raise a dispute if needed');
    }
    if (trade.status === P2PTradeStatus.CANCEL_PENDING && trade.cancelAvailableAt && trade.cancelAvailableAt <= new Date()) {
      await this.cancelTrade(trade.id);
      return this.getTradeForUser(userId, trade.id);
    }
    if (trade.status !== P2PTradeStatus.AWAITING_PAYMENT) {
      throw new UnprocessableEntityException('This trade cannot be cancelled');
    }
    const settings = await this.settingsRow();
    await this.prisma.p2PTokenTrade.update({
      where: { id: tradeId },
      data: {
        status: P2PTradeStatus.CANCEL_PENDING,
        cancelRequestedByUserId: userId,
        cancelAvailableAt: addMinutes(new Date(), settings.cancelGraceMinutes),
      },
    });
    return this.getTradeForUser(userId, tradeId);
  }

  async release(userId: string, tradeId: string) {
    await this.expireStaleRecords();
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId }, include: { offer: true } });
    if (!trade || trade.sellerId !== userId) throw new NotFoundException('Trade not found');
    if (trade.status !== P2PTradeStatus.PAID_MARKED) throw new UnprocessableEntityException('Only paid trades can be released');
    await this.releaseTradeToBuyer(trade.id);
    return this.getTradeForUser(userId, tradeId);
  }

  async raiseDispute(userId: string, tradeId: string, dto: RaiseDisputeDto) {
    await this.expireStaleRecords();
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId } });
    if (!trade || (trade.buyerId !== userId && trade.sellerId !== userId)) throw new NotFoundException('Trade not found');
    if (
      trade.status === P2PTradeStatus.RELEASED ||
      trade.status === P2PTradeStatus.CANCELLED ||
      trade.status === P2PTradeStatus.EXPIRED
    ) {
      throw new UnprocessableEntityException('This trade is already closed');
    }
    await this.prisma.$transaction([
      this.prisma.p2PTokenTrade.update({ where: { id: tradeId }, data: { status: P2PTradeStatus.DISPUTED, disputedAt: new Date() } }),
      this.prisma.p2PDispute.upsert({
        where: { tradeId },
        create: { tradeId, raisedByUserId: userId, reason: dto.reason, evidenceUrl: dto.evidenceUrl },
        update: { reason: dto.reason, evidenceUrl: dto.evidenceUrl, status: P2PDisputeStatus.OPEN },
      }),
      this.prisma.p2PTokenOffer.update({ where: { id: trade.offerId }, data: { status: P2POfferStatus.DISPUTED } }),
    ]);
    return this.getTradeForUser(userId, tradeId);
  }

  async adminListTrades(query: ListTradesDto) {
    await this.expireStaleRecords();
    const trades = await this.prisma.p2PTokenTrade.findMany({
      where: query.status ? { status: query.status } : {},
      include: tradeInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return trades.map((trade) => serializeTrade(trade));
  }

  async adminListDisputes(query: ListDisputesDto) {
    const disputes = await this.prisma.p2PDispute.findMany({
      where: query.status ? { status: query.status } : {},
      include: { trade: { include: tradeInclude }, raisedByUser: userSelect, resolvedByAdmin: userSelect },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return disputes.map((dispute) => ({
      id: dispute.id,
      status: dispute.status,
      reason: dispute.reason,
      evidenceUrl: dispute.evidenceUrl,
      resolutionNote: dispute.resolutionNote,
      createdAt: dispute.createdAt,
      resolvedAt: dispute.resolvedAt,
      raisedBy: dispute.raisedByUser,
      resolvedByAdmin: dispute.resolvedByAdmin,
      trade: serializeTrade(dispute.trade),
    }));
  }

  async resolveDispute(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.p2PDispute.findUnique({ where: { id: disputeId }, include: { trade: true } });
    if (!dispute || dispute.status !== P2PDisputeStatus.OPEN) throw new NotFoundException('Open dispute not found');
    if (dto.winner === 'buyer') {
      await this.releaseTradeToBuyer(dispute.tradeId, disputeId, adminId, dto.resolutionNote);
    } else {
      await this.refundTradeToSeller(dispute.tradeId, disputeId, adminId, dto.resolutionNote);
    }
    return this.prisma.p2PDispute.findUnique({ where: { id: disputeId }, include: { trade: { include: tradeInclude } } });
  }

  private async settingsRow() {
    return this.prisma.p2PMarketSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  private async requireMarketEnabled(type: P2POfferType) {
    const settings = await this.settingsRow();
    if (!settings.enabled) throw new UnprocessableEntityException('P2P token market is disabled');
    if (type === P2POfferType.SELL && !settings.sellOffersEnabled) {
      throw new UnprocessableEntityException('Sell offers are disabled');
    }
    if (type === P2POfferType.BUY && !settings.buyRequestsEnabled) {
      throw new UnprocessableEntityException('Buy requests are disabled');
    }
    return settings;
  }

  private validateTradeInput(settings: Awaited<ReturnType<P2PService['settingsRow']>>, tokenAmount: number, fiatCurrency: string, paymentMethod: string) {
    if (tokenAmount < settings.minTradeTokens.toNumber() || tokenAmount > settings.maxTradeTokens.toNumber()) {
      throw new UnprocessableEntityException(
        `Trade amount must be between ${settings.minTradeTokens.toString()} and ${settings.maxTradeTokens.toString()} tokens`,
      );
    }
    if (!csvIncludes(settings.allowedFiatCurrencies, fiatCurrency)) throw new UnprocessableEntityException('Fiat currency is not allowed');
    if (!csvIncludes(settings.allowedPaymentMethods, paymentMethod)) throw new UnprocessableEntityException('Payment method is not allowed');
  }

  private async getEnabledPaymentMethod(userId: string, id: string) {
    const method = await this.prisma.userPaymentMethod.findFirst({ where: { id, userId, enabled: true } });
    if (!method) throw new NotFoundException('Enabled payment method not found');
    return method;
  }

  private async verifyPaymentMethodOtp(userId: string, dto: UpsertPaymentMethodDto & { id?: string }) {
    await this.otp.verify({
      otpRequestId: dto.otpRequestId,
      userId,
      purpose: OtpPurpose.P2P_PAYMENT_METHOD,
      code: dto.code,
      contextHash: paymentMethodContextHash(dto),
    });
  }

  private async enforceOpenTradeLimit(userId: string, max: number) {
    const openTrades = await this.prisma.p2PTokenTrade.count({
      where: { status: { in: OPEN_TRADE_STATUSES }, OR: [{ buyerId: userId }, { sellerId: userId }] },
    });
    if (openTrades >= max) throw new UnprocessableEntityException(`You can only keep ${max} open P2P trades`);
  }

  private async getOfferForUser(userId: string, id: string) {
    const offer = await this.prisma.p2PTokenOffer.findUnique({ where: { id }, include: { paymentMethodRef: true } });
    if (!offer) throw new NotFoundException('Offer not found');
    return serializeOffer(offer, offer.userId === userId);
  }

  private async getTradeForUser(userId: string, id: string) {
    const trade = await this.prisma.p2PTokenTrade.findFirst({
      where: { id, OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: tradeInclude,
    });
    if (!trade) throw new NotFoundException('Trade not found');
    return serializeTrade(trade, userId);
  }

  private async expireStaleRecords() {
    const now = new Date();
    const expiredSellOffers = await this.prisma.p2PTokenOffer.findMany({
      where: { type: P2POfferType.SELL, status: P2POfferStatus.ACTIVE, expiresAt: { lt: now } },
      select: { id: true },
      take: 25,
    });
    for (const offer of expiredSellOffers) await this.cancelSellOffer(offer.id, P2POfferStatus.EXPIRED);

    await this.prisma.p2PTokenOffer.updateMany({
      where: { type: P2POfferType.BUY, status: P2POfferStatus.ACTIVE, expiresAt: { lt: now } },
      data: { status: P2POfferStatus.EXPIRED },
    });

    const expiredTrades = await this.prisma.p2PTokenTrade.findMany({
      where: {
        OR: [
          { status: P2PTradeStatus.AWAITING_PAYMENT, paymentDeadlineAt: { lt: now } },
          { status: P2PTradeStatus.CANCEL_PENDING, cancelAvailableAt: { lt: now } },
        ],
      },
      select: { id: true },
      take: 25,
    });
    for (const trade of expiredTrades) await this.cancelTrade(trade.id);
  }

  private async cancelSellOffer(offerId: string, status: 'EXPIRED' | 'CANCELLED') {
    const offer = await this.prisma.p2PTokenOffer.findUnique({ where: { id: offerId }, include: { user: { include: { wallet: true } } } });
    if (!offer || offer.type !== P2POfferType.SELL || offer.status !== P2POfferStatus.ACTIVE || !offer.user.wallet) return;
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: offer.user.wallet.id },
        data: { lockedBalance: { decrement: offer.tokenAmount }, balance: { increment: offer.tokenAmount } },
      }),
      this.prisma.ledgerEntry.create({
        data: { walletId: offer.user.wallet.id, type: LedgerEntryType.P2P_ESCROW_REFUND, amount: offer.tokenAmount, reference: offer.id },
      }),
      this.prisma.p2PTokenOffer.update({ where: { id: offer.id }, data: { status, cancelledAt: status === P2POfferStatus.CANCELLED ? new Date() : undefined } }),
    ]);
  }

  private async cancelTrade(tradeId: string) {
    await this.refundTradeToSeller(tradeId);
  }

  private async refundTradeToSeller(tradeId: string, disputeId?: string, adminId?: string, resolutionNote?: string) {
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId }, include: { seller: { include: { wallet: true } } } });
    if (
      !trade ||
      !trade.seller.wallet ||
      trade.status === P2PTradeStatus.CANCELLED ||
      trade.status === P2PTradeStatus.RELEASED ||
      trade.status === P2PTradeStatus.EXPIRED
    ) return;
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: trade.seller.wallet.id },
        data: { lockedBalance: { decrement: trade.tokenAmount }, balance: { increment: trade.tokenAmount } },
      }),
      this.prisma.ledgerEntry.create({
        data: { walletId: trade.seller.wallet.id, type: LedgerEntryType.P2P_ESCROW_REFUND, amount: trade.tokenAmount, reference: trade.id },
      }),
      this.prisma.p2PTokenTrade.update({ where: { id: trade.id }, data: { status: P2PTradeStatus.CANCELLED, cancelledAt: new Date() } }),
      this.prisma.p2PTokenOffer.update({ where: { id: trade.offerId }, data: { status: P2POfferStatus.CANCELLED, cancelledAt: new Date() } }),
      ...(disputeId
        ? [
            this.prisma.p2PDispute.update({
              where: { id: disputeId },
              data: {
                status: P2PDisputeStatus.RESOLVED_SELLER,
                resolvedByAdminId: adminId,
                resolutionNote,
                resolvedAt: new Date(),
              },
            }),
          ]
        : []),
    ]);
  }

  private async releaseTradeToBuyer(tradeId: string, disputeId?: string, adminId?: string, resolutionNote?: string) {
    const trade = await this.prisma.p2PTokenTrade.findUnique({
      where: { id: tradeId },
      include: { seller: { include: { wallet: true } }, buyer: { include: { wallet: true } } },
    });
    if (
      !trade ||
      !trade.seller.wallet ||
      trade.status === P2PTradeStatus.RELEASED ||
      trade.status === P2PTradeStatus.CANCELLED ||
      trade.status === P2PTradeStatus.EXPIRED
    ) return;
    const buyerWallet = trade.buyer.wallet ?? (await this.prisma.wallet.create({ data: { userId: trade.buyerId } }));
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: trade.seller.wallet.id },
        data: { lockedBalance: { decrement: trade.tokenAmount } },
      }),
      this.prisma.wallet.update({
        where: { id: buyerWallet.id },
        data: { balance: { increment: trade.tokenAmount } },
      }),
      this.prisma.ledgerEntry.create({
        data: { walletId: trade.seller.wallet.id, type: LedgerEntryType.P2P_ESCROW_RELEASE, amount: 0, reference: trade.id },
      }),
      this.prisma.ledgerEntry.create({
        data: { walletId: buyerWallet.id, type: LedgerEntryType.P2P_ESCROW_CREDIT, amount: trade.tokenAmount, reference: trade.id },
      }),
      this.prisma.p2PTokenTrade.update({ where: { id: trade.id }, data: { status: P2PTradeStatus.RELEASED, releasedAt: new Date() } }),
      this.prisma.p2PTokenOffer.update({ where: { id: trade.offerId }, data: { status: P2POfferStatus.COMPLETED, completedAt: new Date() } }),
      ...(disputeId
        ? [
            this.prisma.p2PDispute.update({
              where: { id: disputeId },
              data: {
                status: P2PDisputeStatus.RESOLVED_BUYER,
                resolvedByAdminId: adminId,
                resolutionNote,
                resolvedAt: new Date(),
              },
            }),
          ]
        : []),
    ]);
  }
}

const userSelect = { select: { id: true, firstName: true, lastName: true, email: true } };
const tradeInclude = {
  offer: true,
  buyer: userSelect,
  seller: userSelect,
  sellerPaymentMethod: true,
  dispute: true,
} satisfies Prisma.P2PTokenTradeInclude;

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function csvIncludes(csv: string, value: string) {
  return csv.split(',').map((item) => item.trim().toUpperCase()).includes(value.trim().toUpperCase());
}

function paymentMethodData(dto: UpsertPaymentMethodDto) {
  return {
    label: dto.label.trim(),
    methodType: dto.methodType.trim().toUpperCase(),
    fiatCurrency: dto.fiatCurrency.trim().toUpperCase(),
    bankName: dto.bankName?.trim() || null,
    accountName: dto.accountName?.trim() || null,
    accountNumber: dto.accountNumber?.trim() || null,
    instructions: dto.instructions?.trim() || null,
    enabled: dto.enabled ?? true,
  };
}

function serializeSettings(row: Awaited<ReturnType<P2PService['settingsRow']>>) {
  return {
    ...row,
    minTradeTokens: row.minTradeTokens.toString(),
    maxTradeTokens: row.maxTradeTokens.toString(),
  };
}

function serializeOffer(offer: any, includePayment: boolean) {
  return {
    id: offer.id,
    type: offer.type,
    userId: offer.userId,
    user: 'user' in offer ? offer.user : undefined,
    tokenAmount: offer.tokenAmount.toString(),
    remainingTokens: offer.remainingTokens.toString(),
    fiatAmount: offer.fiatAmount.toString(),
    fiatCurrency: offer.fiatCurrency,
    paymentMethod: offer.paymentMethod,
    paymentMethodDetails: includePayment && 'paymentMethodRef' in offer ? offer.paymentMethodRef : null,
    status: offer.status,
    expiresAt: offer.expiresAt,
    completedAt: offer.completedAt,
    cancelledAt: offer.cancelledAt,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

function serializeTrade(trade: Prisma.P2PTokenTradeGetPayload<{ include: typeof tradeInclude }>, viewerId?: string) {
  const isParticipant = viewerId ? trade.buyerId === viewerId || trade.sellerId === viewerId : true;
  return {
    id: trade.id,
    offerId: trade.offerId,
    offerType: trade.offer.type,
    buyerId: trade.buyerId,
    sellerId: trade.sellerId,
    buyer: trade.buyer,
    seller: trade.seller,
    tokenAmount: trade.tokenAmount.toString(),
    fiatAmount: trade.fiatAmount.toString(),
    fiatCurrency: trade.fiatCurrency,
    paymentMethod: trade.paymentMethod,
    sellerPaymentMethod: isParticipant ? trade.sellerPaymentMethod : null,
    status: trade.status,
    paymentDeadlineAt: trade.paymentDeadlineAt,
    cancelRequestedByUserId: trade.cancelRequestedByUserId,
    cancelAvailableAt: trade.cancelAvailableAt,
    paidAt: trade.paidAt,
    releasedAt: trade.releasedAt,
    cancelledAt: trade.cancelledAt,
    disputedAt: trade.disputedAt,
    dispute: trade.dispute,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}
