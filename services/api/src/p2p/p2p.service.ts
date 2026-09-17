import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { resolveOtpDestination } from '../otp/otp.util';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { SmsService } from '../sms/sms.service';
import { tokensToLocalCurrency } from '../wallet/currency-rate.util';
import { tokensToUsdt } from '../wallet/token-rate.util';
import { decryptPayoutField, EncryptedPayoutField } from '../common/payout-crypto.util';
import {
  AcceptOfferDto,
  CreateOfferDto,
  ListDisputesDto,
  ListOffersDto,
  ListTradesDto,
  RequestP2pTradeOtpDto,
  RaiseDisputeDto,
  ResolveDisputeDto,
  UpdateP2PMarketSettingsDto,
  UpdateP2pPaymentInstructionsDto,
} from './dto/p2p.dto';
import { p2pTradeOtpContextHash } from './p2p-trade-otp-context.util';

const OPEN_OFFER_STATUSES = [P2POfferStatus.ACTIVE, P2POfferStatus.RESERVED];
const OPEN_TRADE_STATUSES = [
  P2PTradeStatus.AWAITING_PAYMENT,
  P2PTradeStatus.PAID_MARKED,
  P2PTradeStatus.CANCEL_PENDING,
];

@Injectable()
export class P2PService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly sms: SmsService,
  ) {}

  async getSettings() {
    const row = await this.settingsRow();
    return serializeSettings(row);
  }

  /** Display quotes only; createOffer recalculates every amount server-side. */
  async getReferenceRate(userId: string) {
    const [user, settings, tokenUsdRate] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          country: {
            select: { currencyCode: true, usdExchangeRate: true, exchangeRateUpdatedAt: true },
          },
        },
      }),
      this.settingsRow(),
      this.platformSettings.getTokenUsdRate(),
    ]);
    const allowedCurrencies = parseCsv(settings.allowedFiatCurrencies);
    const fiatCurrencies = allowedCurrencies.filter((currency) => !isUsdEquivalent(currency));
    const countries = fiatCurrencies.length
      ? await this.prisma.country.findMany({
          where: { currencyCode: { in: fiatCurrencies }, usdExchangeRate: { not: null } },
          select: { currencyCode: true, usdExchangeRate: true, exchangeRateUpdatedAt: true },
          orderBy: { exchangeRateUpdatedAt: 'desc' },
        })
      : [];
    const quotes = new Map<string, { tokenReferencePrice: string; updatedAt: Date | null }>();
    for (const currency of allowedCurrencies) {
      if (isUsdEquivalent(currency)) {
        quotes.set(currency, {
          tokenReferencePrice: roundMoney(tokensToUsdt(1, tokenUsdRate)).toString(),
          updatedAt: null,
        });
        continue;
      }
      const country =
        user?.country?.currencyCode.toUpperCase() === currency &&
        user.country.usdExchangeRate !== null
          ? user.country
          : countries.find((candidate) => candidate.currencyCode.toUpperCase() === currency);
      if (!country?.usdExchangeRate) continue;
      quotes.set(currency, {
        tokenReferencePrice: roundMoney(
          tokensToLocalCurrency(1, tokenUsdRate, country.usdExchangeRate.toNumber()),
        ).toString(),
        updatedAt: country.exchangeRateUpdatedAt,
      });
    }
    const availableCurrencies = allowedCurrencies.flatMap((currency) => {
      const quote = quotes.get(currency);
      return quote ? [{ currencyCode: currency, ...quote }] : [];
    });
    const preferredCurrency = user?.country?.currencyCode.toUpperCase();
    const preferred =
      availableCurrencies.find((quote) => quote.currencyCode === preferredCurrency) ??
      availableCurrencies[0];
    return {
      currencyCode: preferred?.currencyCode ?? null,
      tokenReferencePrice: preferred?.tokenReferencePrice ?? null,
      tokenUsdPrice: roundMoney(tokenUsdRate).toString(),
      updatedAt: preferred?.updatedAt ?? null,
      availableCurrencies,
    };
  }

  /**
   * Public-to-traders profile shown when tapping an offer's creator: basic
   * identity, join date, and a trust signal (average time this trader took
   * to release tokens as a seller once paid, across their last 20
   * completed sales). No contact details or financials are exposed here.
   */
  async getTraderProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Trader not found');

    const completedSales = await this.prisma.p2PTokenTrade.findMany({
      where: {
        sellerId: userId,
        status: P2PTradeStatus.RELEASED,
        paidAt: { not: null },
        releasedAt: { not: null },
      },
      select: { paidAt: true, releasedAt: true },
      orderBy: { releasedAt: 'desc' },
      take: 20,
    });
    const [completedSaleCount, avgReleaseSeconds] = [
      completedSales.length,
      completedSales.length
        ? Math.round(
            completedSales.reduce(
              (sum, trade) => sum + (trade.releasedAt!.getTime() - trade.paidAt!.getTime()) / 1000,
              0,
            ) / completedSales.length,
          )
        : null,
    ];

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      memberSince: user.createdAt,
      completedSaleCount,
      avgReleaseSeconds,
    };
  }

  async updateSettings(dto: UpdateP2PMarketSettingsDto) {
    if (
      dto.minTradeTokens !== undefined &&
      dto.maxTradeTokens !== undefined &&
      dto.minTradeTokens > dto.maxTradeTokens
    ) {
      throw new BadRequestException('minTradeTokens cannot be greater than maxTradeTokens');
    }
    const row = await this.prisma.p2PMarketSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...dto },
      update: dto,
    });
    return serializeSettings(row);
  }

  async getP2pPaymentInstructions(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { p2pPaymentInstructions: true },
    });
    return { p2pPaymentInstructions: user.p2pPaymentInstructions };
  }

  async updateP2pPaymentInstructions(userId: string, dto: UpdateP2pPaymentInstructionsDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { p2pPaymentInstructions: dto.p2pPaymentInstructions?.trim() || null },
      select: { p2pPaymentInstructions: true },
    });
    return user;
  }

  async requestTradeOtp(userId: string, dto: RequestP2pTradeOtpDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, phoneNumber: true, phoneVerifiedAt: true },
    });
    if (dto.action === 'create-offer') {
      if (!dto.type || !dto.tokenAmount || !dto.fiatCurrency || !dto.paymentMethod) {
        throw new BadRequestException('Complete the offer details before requesting an OTP');
      }
      const settings = await this.requireMarketEnabled(dto.type!);
      this.validateTradeInput(settings, dto.tokenAmount!, dto.fiatCurrency!, dto.paymentMethod!);
      if (dto.type === P2POfferType.SELL) {
        if (!dto.paymentMethodIds?.length) {
          throw new BadRequestException(
            'At least one seller payment method is required for sell offers',
          );
        }
        const methods = await this.getEnabledPaymentMethods(userId, dto.paymentMethodIds);
        const currencies = new Set(methods.map((method) => method.currency.toUpperCase()));
        if (currencies.size !== 1 || !currencies.has(dto.fiatCurrency!.toUpperCase())) {
          throw new UnprocessableEntityException(
            'Selected payout accounts must all use the offer currency',
          );
        }
      }
      await this.resolveOfferQuote(userId, dto.tokenAmount!, dto.fiatCurrency!);
    }
    const contextHash =
      dto.action === 'create-offer'
        ? p2pTradeOtpContextHash({
            action: 'create-offer',
            type: dto.type!,
            tokenAmount: dto.tokenAmount!,
            fiatCurrency: dto.fiatCurrency!,
            paymentMethod: dto.paymentMethod!,
            paymentMethodIds: dto.paymentMethodIds,
          })
        : p2pTradeOtpContextHash({ action: 'accept-offer', offerId: dto.offerId! });
    const { destination, channel } = await resolveOtpDestination(user, this.platformSettings);
    return this.otp.issueForUser(userId, OtpPurpose.P2P_TRADE, destination, contextHash, channel);
  }

  /**
   * Trading gate for offer create/accept: phoneVerifiedAt when
   * phoneVerificationRequired is on (today's behavior, unchanged), or a
   * one-time emailed OTP bound to the exact trade terms when it's off --
   * see requestTradeOtp/p2pTradeOtpContextHash. Never both at once; a
   * platform with phone verification off has no phone number to check.
   */
  private async requireVerifiedForTrading(
    userId: string,
    contextHash: string,
    otpRequestId?: string,
    code?: string,
  ): Promise<void> {
    if (await this.platformSettings.isPhoneVerificationRequired()) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { phoneVerifiedAt: true },
      });
      if (!user.phoneVerifiedAt) {
        throw new UnprocessableEntityException(
          'Verify your phone number before trading on the P2P market',
        );
      }
      return;
    }
    if (!otpRequestId || !code) {
      throw new UnprocessableEntityException(
        'Email OTP verification is required to trade on the P2P market',
      );
    }
    await this.otp.verify({
      otpRequestId,
      userId,
      purpose: OtpPurpose.P2P_TRADE,
      code,
      contextHash,
    });
  }

  /**
   * Best-effort trade-notification SMS -- gated per-event by an admin
   * toggle, silently skipped for unverified/missing phone numbers, and
   * never allowed to fail or block the trade action that triggered it
   * (always called after the triggering DB write has already succeeded).
   */
  private async notify(userId: string, enabled: boolean, body: string): Promise<void> {
    if (!enabled) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true, phoneVerifiedAt: true, smsNotificationsEnabled: true },
    });
    if (!user?.phoneNumber || !user.phoneVerifiedAt || !user.smsNotificationsEnabled) return;
    try {
      await this.sms.sendTransactional(user.phoneNumber, body);
    } catch {
      // Already logged inside SmsFallbackChain -- notification delivery must never fail/block the trade action itself.
    }
  }

  /** Buyer and seller need different instructions -- only the buyer owes a payment, so only the buyer gets a payment deadline. The seller is told a trade started and to wait for payment. */
  private async notifyTradeCreated(
    buyerId: string,
    sellerId: string,
    tokenAmount: string,
    paymentDeadlineAt: Date,
  ): Promise<void> {
    const enabled = await this.platformSettings.isP2pSmsTradeCreatedEnabled();
    const buyerBody = `Dialect Library: Your P2P trade for ${tokenAmount} tokens has started. Pay before ${paymentDeadlineAt.toISOString()}.`;
    const sellerBody = `Dialect Library: A buyer accepted your P2P offer for ${tokenAmount} tokens. Waiting for their payment.`;
    await Promise.all([
      this.notify(buyerId, enabled, buyerBody),
      this.notify(sellerId, enabled, sellerBody),
    ]);
  }

  async createOffer(userId: string, dto: CreateOfferDto) {
    const settings = await this.requireMarketEnabled(dto.type);
    this.validateTradeInput(settings, dto.tokenAmount, dto.fiatCurrency, dto.paymentMethod);
    await this.requireVerifiedForTrading(
      userId,
      p2pTradeOtpContextHash({
        action: 'create-offer',
        type: dto.type,
        tokenAmount: dto.tokenAmount,
        fiatCurrency: dto.fiatCurrency,
        paymentMethod: dto.paymentMethod,
        paymentMethodIds: dto.paymentMethodIds,
      }),
      dto.otpRequestId,
      dto.code,
    );

    const openOffers = await this.prisma.p2PTokenOffer.count({
      where: { userId, status: { in: OPEN_OFFER_STATUSES } },
    });
    if (openOffers >= settings.maxOpenOffersPerUser) {
      throw new UnprocessableEntityException(
        `You can only keep ${settings.maxOpenOffersPerUser} open P2P offers`,
      );
    }

    let paymentMethodIds: string[] = [];
    if (dto.type === P2POfferType.SELL) {
      if (!dto.paymentMethodIds || dto.paymentMethodIds.length === 0) {
        throw new BadRequestException(
          'At least one seller payment method is required for sell offers',
        );
      }
      const methods = await this.getEnabledPaymentMethods(userId, dto.paymentMethodIds);
      paymentMethodIds = methods.map((method) => method.id);
      const accountCurrencies = new Set(methods.map((method) => method.currency.toUpperCase()));
      if (accountCurrencies.size !== 1 || !accountCurrencies.has(dto.fiatCurrency.toUpperCase())) {
        throw new UnprocessableEntityException(
          'Selected payout accounts must all use the offer currency',
        );
      }
    }
    const primaryPaymentMethodId = paymentMethodIds[0];
    const quote = await this.resolveOfferQuote(userId, dto.tokenAmount, dto.fiatCurrency);

    const offerId = randomUUID();
    const expiresInMinutes = Math.min(
      dto.expiresInMinutes ?? settings.offerExpiryMinutes,
      settings.offerExpiryMinutes,
    );
    const expiresAt = addMinutes(new Date(), expiresInMinutes);

    if (dto.type === P2POfferType.BUY) {
      const offer = await this.prisma.p2PTokenOffer.create({
        data: {
          id: offerId,
          type: dto.type,
          userId,
          tokenAmount: dto.tokenAmount,
          remainingTokens: dto.tokenAmount,
          usdAmount: quote.usdAmount,
          fiatAmount: quote.fiatAmount,
          fiatCurrency: quote.currency,
          paymentMethod: dto.paymentMethod,
          expiresAt,
        },
      });
      return this.getOfferForUser(userId, offer.id);
    }

    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: dto.tokenAmount } },
        data: {
          balance: { decrement: dto.tokenAmount },
          lockedBalance: { increment: dto.tokenAmount },
        },
      });
      if (lock.count === 0)
        throw new UnprocessableEntityException('Insufficient spendable token balance');

      await tx.p2PTokenOffer.create({
        data: {
          id: offerId,
          type: dto.type,
          userId,
          tokenAmount: dto.tokenAmount,
          remainingTokens: dto.tokenAmount,
          usdAmount: quote.usdAmount,
          fiatAmount: quote.fiatAmount,
          fiatCurrency: quote.currency,
          paymentMethod: dto.paymentMethod,
          paymentMethodId: primaryPaymentMethodId,
          expiresAt,
        },
      });
      if (paymentMethodIds.length > 0) {
        await tx.p2POfferPaymentMethod.createMany({
          data: paymentMethodIds.map((payoutAccountId) => ({ offerId, payoutAccountId })),
        });
      }
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.P2P_ESCROW_LOCK,
          amount: -dto.tokenAmount,
          reference: offerId,
        },
      });
    });
    return this.getOfferForUser(userId, offerId);
  }

  async listOffers(userId: string, query: ListOffersDto) {
    await this.expireStaleRecords();
    const where: Prisma.P2PTokenOfferWhereInput = {
      status: query.status ?? P2POfferStatus.ACTIVE,
      ...(query.type ? { type: query.type } : {}),
      ...(query.fiatCurrency ? { fiatCurrency: query.fiatCurrency } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.minTokenAmount !== undefined || query.maxTokenAmount !== undefined
        ? {
            tokenAmount: {
              ...(query.minTokenAmount !== undefined ? { gte: query.minTokenAmount } : {}),
              ...(query.maxTokenAmount !== undefined ? { lte: query.maxTokenAmount } : {}),
            },
          }
        : {}),
      ...(query.minFiatAmount !== undefined || query.maxFiatAmount !== undefined
        ? {
            fiatAmount: {
              ...(query.minFiatAmount !== undefined ? { gte: query.minFiatAmount } : {}),
              ...(query.maxFiatAmount !== undefined ? { lte: query.maxFiatAmount } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortDir = query.sortDir ?? 'desc';

    if (query.sortBy === 'price') {
      const whereSql = this.buildOfferWhereSql(query);
      const [rows, totalRows] = await Promise.all([
        this.prisma.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT o.id
            FROM p2p_token_offers o
            JOIN users u ON u.id = o."userId"
            WHERE ${whereSql}
            ORDER BY (o."fiatAmount" / o."tokenAmount") ${sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}
            OFFSET ${(page - 1) * pageSize}
            LIMIT ${pageSize}
          `,
        ),
        this.prisma.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`
            SELECT COUNT(*) AS count
            FROM p2p_token_offers o
            JOIN users u ON u.id = o."userId"
            WHERE ${whereSql}
          `,
        ),
      ]);
      const ids = rows.map((row) => row.id);
      const offersById = new Map(
        (
          await this.prisma.p2PTokenOffer.findMany({
            where: { id: { in: ids } },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phoneVerifiedAt: true,
                  kycStatus: true,
                  country: { select: { code: true, name: true } },
                },
              },
              paymentMethods: { include: { payoutAccount: true } },
            },
          })
        ).map((offer) => [offer.id, offer]),
      );
      const total = Number(totalRows[0]?.count ?? 0);
      const priceSortedOffers = ids
        .map((id) => offersById.get(id))
        .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer));
      const completedSaleCountByUserId = await this.getCompletedSaleCounts(
        priceSortedOffers.map((offer) => offer.userId),
      );
      return {
        // Raw query's ORDER BY determines position; re-derive it here since
        // findMany({ where: { id: { in } } }) does not preserve `ids`' order.
        items: priceSortedOffers.map((offer) =>
          serializeOffer(
            offer,
            offer.userId === userId,
            completedSaleCountByUserId.get(offer.userId) ?? 0,
          ),
        ),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    const sortColumn: 'createdAt' | 'tokenAmount' | 'fiatAmount' =
      query.sortBy === 'tokenAmount' || query.sortBy === 'fiatAmount' ? query.sortBy : 'createdAt';
    const [offers, total] = await Promise.all([
      this.prisma.p2PTokenOffer.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneVerifiedAt: true,
              kycStatus: true,
              country: { select: { code: true, name: true } },
            },
          },
          paymentMethods: { include: { payoutAccount: true } },
        },
        orderBy: { [sortColumn]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.p2PTokenOffer.count({ where }),
    ]);
    const completedSaleCountByUserId = await this.getCompletedSaleCounts(
      offers.map((offer) => offer.userId),
    );
    return {
      items: offers.map((offer) =>
        serializeOffer(
          offer,
          offer.userId === userId,
          completedSaleCountByUserId.get(offer.userId) ?? 0,
        ),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Batched equivalent of getTraderProfile's completedSaleCount, for a page
   * of offers at once -- a single groupBy rather than one query per row, so
   * the market list stays one round trip regardless of page size. Same
   * RELEASED+paidAt+releasedAt definition of "completed sale" as
   * getTraderProfile, just without the 20-row cap (that cap exists there to
   * bound the avgReleaseSeconds sample, which this callsite doesn't need).
   */
  private async getCompletedSaleCounts(userIds: string[]): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return new Map();
    const rows = await this.prisma.p2PTokenTrade.groupBy({
      by: ['sellerId'],
      where: {
        sellerId: { in: uniqueIds },
        status: P2PTradeStatus.RELEASED,
        paidAt: { not: null },
        releasedAt: { not: null },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.sellerId, row._count._all]));
  }

  // Builds the same filter semantics as listOffers' Prisma `where` object,
  // directly from the query DTO, as a parameterized raw-SQL fragment for
  // the price-sort path's $queryRaw calls (Prisma can't ORDER BY a computed
  // fiatAmount/tokenAmount expression, so that path bypasses the query
  // builder entirely). Every value is bound via Prisma.sql's tagged-
  // template parameterization, never string-interpolated, so this is not
  // SQL-injectable despite building the clause from user-supplied filters.
  // Keep in sync with listOffers' `where` construction above if filters
  // change.
  private buildOfferWhereSql(query: ListOffersDto): Prisma.Sql {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`o.status = ${query.status ?? P2POfferStatus.ACTIVE}::"P2POfferStatus"`,
    ];
    if (query.type) {
      clauses.push(Prisma.sql`o.type = ${query.type}::"P2POfferType"`);
    }
    if (query.fiatCurrency) {
      clauses.push(Prisma.sql`o."fiatCurrency" = ${query.fiatCurrency}`);
    }
    if (query.paymentMethod) {
      clauses.push(Prisma.sql`o."paymentMethod" = ${query.paymentMethod}`);
    }
    if (query.minTokenAmount !== undefined) {
      clauses.push(Prisma.sql`o."tokenAmount" >= ${query.minTokenAmount}`);
    }
    if (query.maxTokenAmount !== undefined) {
      clauses.push(Prisma.sql`o."tokenAmount" <= ${query.maxTokenAmount}`);
    }
    if (query.minFiatAmount !== undefined) {
      clauses.push(Prisma.sql`o."fiatAmount" >= ${query.minFiatAmount}`);
    }
    if (query.maxFiatAmount !== undefined) {
      clauses.push(Prisma.sql`o."fiatAmount" <= ${query.maxFiatAmount}`);
    }
    if (query.search) {
      const like = `%${query.search}%`;
      clauses.push(
        Prisma.sql`(u."firstName" ILIKE ${like} OR u."lastName" ILIKE ${like} OR u."email" ILIKE ${like})`,
      );
    }
    return Prisma.join(clauses, ' AND ');
  }

  async listMyOffers(userId: string) {
    await this.expireStaleRecords();
    const offers = await this.prisma.p2PTokenOffer.findMany({
      where: { userId },
      include: { paymentMethodRef: true, paymentMethods: { include: { payoutAccount: true } } },
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
      throw new UnprocessableEntityException(
        'Only active, unaccepted offers can be cancelled directly',
      );
    }
    if (offer.type === P2POfferType.SELL) {
      await this.cancelSellOffer(offer.id, P2POfferStatus.CANCELLED);
    } else {
      await this.prisma.p2PTokenOffer.update({
        where: { id: offer.id },
        data: { status: P2POfferStatus.CANCELLED, cancelledAt: new Date() },
      });
    }
    return this.getOfferForUser(userId, offer.id);
  }

  /**
   * Admin kill-switch support: cancels every open offer/trade this user is
   * party to (as offerer, buyer, or seller), refunding escrow the same way
   * cancelSellOffer/cancelTrade already do for their normal cancellation
   * paths -- reused here rather than duplicated so the refund/ledger
   * behavior can never drift between a user's own cancel and an admin's.
   * Trades where the user is only the buyer (no escrow held on their
   * wallet) still get cancelled so they stop being "open" from the other
   * party's perspective; refundTradeToSeller is a no-op-safe refund of the
   * seller's escrow regardless of which side triggered the cancellation.
   */
  async adminCancelAllForUser(userId: string): Promise<void> {
    const offers = await this.prisma.p2PTokenOffer.findMany({
      where: { userId, status: { in: OPEN_OFFER_STATUSES } },
      select: { id: true, type: true, status: true },
    });
    for (const offer of offers) {
      if (offer.status === P2POfferStatus.ACTIVE && offer.type === P2POfferType.SELL) {
        await this.cancelSellOffer(offer.id, P2POfferStatus.CANCELLED);
      } else if (offer.status === P2POfferStatus.ACTIVE) {
        await this.prisma.p2PTokenOffer.update({
          where: { id: offer.id },
          data: { status: P2POfferStatus.CANCELLED, cancelledAt: new Date() },
        });
      }
    }

    const trades = await this.prisma.p2PTokenTrade.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        status: { in: OPEN_TRADE_STATUSES },
      },
      select: { id: true },
    });
    for (const trade of trades) {
      await this.refundTradeToSeller(trade.id);
    }
  }

  async acceptOffer(userId: string, offerId: string, dto: AcceptOfferDto) {
    await this.requireVerifiedForTrading(
      userId,
      p2pTradeOtpContextHash({ action: 'accept-offer', offerId }),
      dto.otpRequestId,
      dto.code,
    );
    await this.expireStaleRecords();
    const offer = await this.prisma.p2PTokenOffer.findUnique({
      where: { id: offerId },
      include: { paymentMethodRef: true, paymentMethods: true },
    });
    if (!offer || offer.status !== P2POfferStatus.ACTIVE || offer.expiresAt <= new Date()) {
      throw new NotFoundException('Active offer not found');
    }
    if (offer.userId === userId) throw new ForbiddenException('You cannot accept your own offer');

    const settings = await this.requireMarketEnabled(offer.type);
    await this.enforceOpenTradeLimit(userId, settings.maxOpenTradesPerUser);

    const tradeId = randomUUID();
    const paymentDeadlineAt = addMinutes(new Date(), settings.paymentWindowMinutes);

    if (offer.type === P2POfferType.SELL) {
      // Buyer picks which of the seller's selected accounts to pay into --
      // falls back to the offer's primary paymentMethodId when the offer
      // only ever had one (or the buyer didn't specify), so older
      // single-account offers keep working unchanged.
      const offerAccountIds = offer.paymentMethods.map((row) => row.payoutAccountId);
      const chosenId = dto.sellerPaymentMethodId ?? offer.paymentMethodId;
      if (!chosenId) throw new BadRequestException('This offer has no payment method to pay into');
      if (offerAccountIds.length > 0 && !offerAccountIds.includes(chosenId)) {
        throw new BadRequestException('That payment method is not offered by this seller');
      }
      await this.prisma.$transaction([
        this.prisma.p2PTokenOffer.update({
          where: { id: offer.id },
          data: { status: P2POfferStatus.RESERVED },
        }),
        this.prisma.p2PTokenTrade.create({
          data: {
            id: tradeId,
            offerId: offer.id,
            buyerId: userId,
            sellerId: offer.userId,
            sellerPaymentMethodId: chosenId,
            tokenAmount: offer.tokenAmount,
            usdAmount: offer.usdAmount,
            fiatAmount: offer.fiatAmount,
            fiatCurrency: offer.fiatCurrency,
            paymentMethod: offer.paymentMethod,
            paymentDeadlineAt,
          },
        }),
      ]);
      await this.notifyTradeCreated(
        userId,
        offer.userId,
        offer.tokenAmount.toString(),
        paymentDeadlineAt,
      );
      return this.getTradeForUser(userId, tradeId);
    }

    if (!dto.sellerPaymentMethodId)
      throw new BadRequestException('Seller payment method is required');
    const paymentMethod = await this.getEnabledPaymentMethod(userId, dto.sellerPaymentMethodId);
    if (paymentMethod.currency.toUpperCase() !== offer.fiatCurrency.toUpperCase()) {
      throw new UnprocessableEntityException(
        `Select a payout account that receives ${offer.fiatCurrency}`,
      );
    }
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: offer.tokenAmount } },
        data: {
          balance: { decrement: offer.tokenAmount },
          lockedBalance: { increment: offer.tokenAmount },
        },
      });
      if (lock.count === 0)
        throw new UnprocessableEntityException('Insufficient spendable token balance');

      await tx.p2PTokenOffer.update({
        where: { id: offer.id },
        data: { status: P2POfferStatus.RESERVED },
      });
      await tx.p2PTokenTrade.create({
        data: {
          id: tradeId,
          offerId: offer.id,
          buyerId: offer.userId,
          sellerId: userId,
          sellerPaymentMethodId: paymentMethod.id,
          tokenAmount: offer.tokenAmount,
          usdAmount: offer.usdAmount,
          fiatAmount: offer.fiatAmount,
          fiatCurrency: offer.fiatCurrency,
          paymentMethod: offer.paymentMethod,
          paymentDeadlineAt,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.P2P_ESCROW_LOCK,
          amount: -offer.tokenAmount,
          reference: tradeId,
        },
      });
    });
    await this.notifyTradeCreated(
      offer.userId,
      userId,
      offer.tokenAmount.toString(),
      paymentDeadlineAt,
    );
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
    if (
      trade.status !== P2PTradeStatus.AWAITING_PAYMENT &&
      trade.status !== P2PTradeStatus.CANCEL_PENDING
    ) {
      throw new UnprocessableEntityException('This trade can no longer be marked paid');
    }
    if (trade.paymentDeadlineAt < new Date())
      throw new UnprocessableEntityException('Payment window has expired');
    await this.prisma.p2PTokenTrade.update({
      where: { id: tradeId },
      data: {
        status: P2PTradeStatus.PAID_MARKED,
        paidAt: new Date(),
        cancelRequestedByUserId: null,
        cancelAvailableAt: null,
      },
    });
    await this.notify(
      trade.sellerId,
      await this.platformSettings.isP2pSmsPaymentMarkedEnabled(),
      'Dialect Library: The buyer marked your P2P trade as paid -- confirm and release tokens in the app.',
    );
    return this.getTradeForUser(userId, tradeId);
  }

  async requestCancel(userId: string, tradeId: string) {
    await this.expireStaleRecords();
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId } });
    if (!trade || (trade.buyerId !== userId && trade.sellerId !== userId))
      throw new NotFoundException('Trade not found');
    if (trade.status === P2PTradeStatus.PAID_MARKED) {
      throw new UnprocessableEntityException(
        'Paid trades cannot be cancelled; raise a dispute if needed',
      );
    }
    if (
      trade.status === P2PTradeStatus.CANCEL_PENDING &&
      trade.cancelAvailableAt &&
      trade.cancelAvailableAt <= new Date()
    ) {
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
    const trade = await this.prisma.p2PTokenTrade.findUnique({
      where: { id: tradeId },
      include: { offer: true },
    });
    if (!trade || trade.sellerId !== userId) throw new NotFoundException('Trade not found');
    if (trade.status !== P2PTradeStatus.PAID_MARKED)
      throw new UnprocessableEntityException('Only paid trades can be released');
    await this.releaseTradeToBuyer(trade.id);
    await this.notify(
      trade.buyerId,
      await this.platformSettings.isP2pSmsTokensReleasedEnabled(),
      'Dialect Library: Tokens released -- your P2P trade is complete.',
    );
    return this.getTradeForUser(userId, tradeId);
  }

  async raiseDispute(userId: string, tradeId: string, dto: RaiseDisputeDto) {
    await this.expireStaleRecords();
    const trade = await this.prisma.p2PTokenTrade.findUnique({ where: { id: tradeId } });
    if (!trade || (trade.buyerId !== userId && trade.sellerId !== userId))
      throw new NotFoundException('Trade not found');
    if (
      trade.status === P2PTradeStatus.RELEASED ||
      trade.status === P2PTradeStatus.CANCELLED ||
      trade.status === P2PTradeStatus.EXPIRED
    ) {
      throw new UnprocessableEntityException('This trade is already closed');
    }
    await this.prisma.$transaction([
      this.prisma.p2PTokenTrade.update({
        where: { id: tradeId },
        data: { status: P2PTradeStatus.DISPUTED, disputedAt: new Date() },
      }),
      this.prisma.p2PDispute.upsert({
        where: { tradeId },
        create: {
          tradeId,
          raisedByUserId: userId,
          reason: dto.reason,
          evidenceUrl: dto.evidenceUrl,
        },
        update: { reason: dto.reason, evidenceUrl: dto.evidenceUrl, status: P2PDisputeStatus.OPEN },
      }),
      this.prisma.p2PTokenOffer.update({
        where: { id: trade.offerId },
        data: { status: P2POfferStatus.DISPUTED },
      }),
    ]);
    const otherPartyId = trade.buyerId === userId ? trade.sellerId : trade.buyerId;
    await this.notify(
      otherPartyId,
      await this.platformSettings.isP2pSmsCancelledEnabled(),
      'Dialect Library: A dispute was raised on your P2P trade.',
    );
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
      include: {
        trade: { include: tradeInclude },
        raisedByUser: userSelect,
        resolvedByAdmin: userSelect,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return disputes.map((dispute) => {
      // The "defaulter" is whichever trade party did NOT raise the dispute
      // -- a dispute is inherently one party reporting the other, so this is
      // always derivable from the trade's own buyer/seller ids rather than
      // needing a separate stored field. Admin UI uses this to show a clear
      // red (defaulter) / green (reporter) distinction instead of two
      // unlabeled emails.
      const defaulter =
        dispute.trade.buyerId === dispute.raisedByUserId ? dispute.trade.seller : dispute.trade.buyer;
      return {
        id: dispute.id,
        status: dispute.status,
        reason: dispute.reason,
        evidenceUrl: dispute.evidenceUrl,
        resolutionNote: dispute.resolutionNote,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
        raisedBy: dispute.raisedByUser,
        defaulter: {
          id: defaulter.id,
          firstName: defaulter.firstName,
          lastName: defaulter.lastName,
          email: defaulter.email,
          phoneNumber: defaulter.phoneNumber,
        },
        resolvedByAdmin: dispute.resolvedByAdmin,
        trade: serializeTrade(dispute.trade),
      };
    });
  }

  async resolveDispute(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.p2PDispute.findUnique({
      where: { id: disputeId },
      include: { trade: true },
    });
    if (!dispute || dispute.status !== P2PDisputeStatus.OPEN)
      throw new NotFoundException('Open dispute not found');
    if (dto.winner === 'buyer') {
      await this.releaseTradeToBuyer(dispute.tradeId, disputeId, adminId, dto.resolutionNote);
    } else {
      await this.refundTradeToSeller(dispute.tradeId, disputeId, adminId, dto.resolutionNote);
    }
    return this.prisma.p2PDispute.findUnique({
      where: { id: disputeId },
      include: { trade: { include: tradeInclude } },
    });
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

  private validateTradeInput(
    settings: Awaited<ReturnType<P2PService['settingsRow']>>,
    tokenAmount: number,
    fiatCurrency: string,
    paymentMethod: string,
  ) {
    if (
      tokenAmount < settings.minTradeTokens.toNumber() ||
      tokenAmount > settings.maxTradeTokens.toNumber()
    ) {
      throw new UnprocessableEntityException(
        `Trade amount must be between ${settings.minTradeTokens.toString()} and ${settings.maxTradeTokens.toString()} tokens`,
      );
    }
    if (!csvIncludes(settings.allowedFiatCurrencies, fiatCurrency))
      throw new UnprocessableEntityException('Fiat currency is not allowed');
    if (!csvIncludes(settings.allowedPaymentMethods, paymentMethod))
      throw new UnprocessableEntityException('Payment method is not allowed');
  }

  private async resolveOfferQuote(userId: string, tokenAmount: number, currencyInput: string) {
    const currency = currencyInput.trim().toUpperCase();
    const tokenUsdRate = await this.platformSettings.getTokenUsdRate();
    const usdAmount = roundMoney(tokensToUsdt(tokenAmount, tokenUsdRate));
    if (isUsdEquivalent(currency)) {
      return { currency, usdAmount, fiatAmount: usdAmount };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        country: { select: { currencyCode: true, usdExchangeRate: true } },
      },
    });
    const country =
      user?.country?.currencyCode.toUpperCase() === currency &&
      user.country.usdExchangeRate !== null
        ? user.country
        : await this.prisma.country.findFirst({
            where: { currencyCode: currency, usdExchangeRate: { not: null } },
            select: { currencyCode: true, usdExchangeRate: true },
            orderBy: { exchangeRateUpdatedAt: 'desc' },
          });
    if (!country?.usdExchangeRate) {
      throw new UnprocessableEntityException(
        `No current USD conversion rate is available for ${currency}`,
      );
    }
    return {
      currency,
      usdAmount,
      fiatAmount: roundMoney(usdAmount * country.usdExchangeRate.toNumber()),
    };
  }

  /**
   * P2P sell offers use the same account list withdrawals do (see
   * PayoutAccount's schema doc) -- ownership is the only requirement now,
   * NOT verificationStatus === VERIFIED. A free-entry (UNVERIFIED) account
   * is a valid receive option; the UI surfaces its unverified status to the
   * buyer via serializeOffer/serializeTrade rather than hiding it from P2P
   * entirely.
   */
  private async getEnabledPaymentMethod(userId: string, id: string) {
    const method = await this.prisma.payoutAccount.findFirst({
      where: { id, userId },
    });
    if (!method) throw new NotFoundException('Payout account not found');
    return method;
  }

  /** Multi-account variant of getEnabledPaymentMethod -- validates every id in ids is owned by userId, in one query, returning them in ids' order (not DB order) so paymentMethodIds[0] reliably stays the "primary" account. */
  private async getEnabledPaymentMethods(userId: string, ids: string[]) {
    const unique = Array.from(new Set(ids));
    const methods = await this.prisma.payoutAccount.findMany({
      where: { id: { in: unique }, userId },
    });
    if (methods.length !== unique.length) {
      throw new NotFoundException('One or more payout accounts were not found');
    }
    const byId = new Map(methods.map((method) => [method.id, method]));
    return unique.map((id) => byId.get(id)!);
  }

  private async enforceOpenTradeLimit(userId: string, max: number) {
    const openTrades = await this.prisma.p2PTokenTrade.count({
      where: {
        status: { in: OPEN_TRADE_STATUSES },
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
    });
    if (openTrades >= max)
      throw new UnprocessableEntityException(`You can only keep ${max} open P2P trades`);
  }

  private async getOfferForUser(userId: string, id: string) {
    const offer = await this.prisma.p2PTokenOffer.findUnique({
      where: { id },
      include: { paymentMethodRef: true, paymentMethods: { include: { payoutAccount: true } } },
    });
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
    for (const offer of expiredSellOffers)
      await this.cancelSellOffer(offer.id, P2POfferStatus.EXPIRED);

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
    const offer = await this.prisma.p2PTokenOffer.findUnique({
      where: { id: offerId },
      include: { user: { include: { wallet: true } } },
    });
    if (
      !offer ||
      offer.type !== P2POfferType.SELL ||
      offer.status !== P2POfferStatus.ACTIVE ||
      !offer.user.wallet
    )
      return;
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: offer.user.wallet.id },
        data: {
          lockedBalance: { decrement: offer.tokenAmount },
          balance: { increment: offer.tokenAmount },
        },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: offer.user.wallet.id,
          type: LedgerEntryType.P2P_ESCROW_REFUND,
          amount: offer.tokenAmount,
          reference: offer.id,
        },
      }),
      this.prisma.p2PTokenOffer.update({
        where: { id: offer.id },
        data: { status, cancelledAt: status === P2POfferStatus.CANCELLED ? new Date() : undefined },
      }),
    ]);
  }

  private async cancelTrade(tradeId: string) {
    await this.refundTradeToSeller(tradeId);
  }

  /**
   * Takes a trade out of play by moving it off `expectedStatus`, returning
   * false if someone else got there first.
   *
   * This is the single serialization point for escrow resolution. Exactly
   * one of releaseTradeToBuyer / refundTradeToSeller may ever pay out a
   * given trade's locked tokens, and both are reachable concurrently --
   * a seller releasing while an admin resolves a dispute, or while any of
   * the many read endpoints that call expireStaleRecords sweeps the same
   * row. Their own terminal-status checks read the trade before the
   * transaction opens, so they cannot exclude each other; the ledger's
   * unique constraint cannot either, since the two paths write different
   * entry types against the same trade id. Whoever wins this claim owns
   * the escrow.
   *
   * Deliberately a transitional status rather than the final one: the
   * caller still sets RELEASED/CANCELLED with its own timestamps in the
   * transaction that moves the money, so a crash after the claim leaves the
   * trade visibly mid-resolution rather than falsely terminal.
   */
  private async claimTradeOutOfPlay(
    tradeId: string,
    expectedStatus: P2PTradeStatus,
  ): Promise<boolean> {
    const claim = await this.prisma.p2PTokenTrade.updateMany({
      where: { id: tradeId, status: expectedStatus },
      data: { status: P2PTradeStatus.SETTLING },
    });
    return claim.count === 1;
  }

  private async refundTradeToSeller(
    tradeId: string,
    disputeId?: string,
    adminId?: string,
    resolutionNote?: string,
  ) {
    const trade = await this.prisma.p2PTokenTrade.findUnique({
      where: { id: tradeId },
      include: { seller: { include: { wallet: true } } },
    });
    if (
      !trade ||
      !trade.seller.wallet ||
      trade.status === P2PTradeStatus.CANCELLED ||
      trade.status === P2PTradeStatus.RELEASED ||
      trade.status === P2PTradeStatus.EXPIRED
    )
      return;
    // Atomically claim the trade out of its current status before moving any
    // escrow. The terminal-status check above ran against a row read outside
    // this transaction, so on its own it cannot stop a release and a refund
    // from both passing and both paying out the same locked tokens -- and
    // the ledger's unique constraint does not catch that pair, because
    // P2P_ESCROW_RELEASE and P2P_ESCROW_REFUND are different types against
    // the same reference. expireStaleRecords runs on many read endpoints
    // (including inside release()), so the two really can overlap.
    const claimed = await this.claimTradeOutOfPlay(trade.id, trade.status);
    if (!claimed) return;
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: trade.seller.wallet.id },
        data: {
          lockedBalance: { decrement: trade.tokenAmount },
          balance: { increment: trade.tokenAmount },
        },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: trade.seller.wallet.id,
          type: LedgerEntryType.P2P_ESCROW_REFUND,
          amount: trade.tokenAmount,
          reference: trade.id,
        },
      }),
      this.prisma.p2PTokenTrade.update({
        where: { id: trade.id },
        data: { status: P2PTradeStatus.CANCELLED, cancelledAt: new Date() },
      }),
      this.prisma.p2PTokenOffer.update({
        where: { id: trade.offerId },
        data: { status: P2POfferStatus.CANCELLED, cancelledAt: new Date() },
      }),
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
    await this.notify(
      trade.sellerId,
      await this.platformSettings.isP2pSmsCancelledEnabled(),
      'Dialect Library: Your P2P trade was cancelled and your tokens were refunded.',
    );
  }

  private async releaseTradeToBuyer(
    tradeId: string,
    disputeId?: string,
    adminId?: string,
    resolutionNote?: string,
  ) {
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
    )
      return;
    // See refundTradeToSeller -- same claim, same reason. This is the other
    // half of the pair that must never both succeed for one escrow.
    const claimed = await this.claimTradeOutOfPlay(trade.id, trade.status);
    if (!claimed) return;
    const buyerWallet =
      trade.buyer.wallet ?? (await this.prisma.wallet.create({ data: { userId: trade.buyerId } }));
    await this.prisma.$transaction([
      this.prisma.wallet.updateMany({
        // gte guard: releasing to the buyer consumes the seller's escrow
        // rather than returning it, so the matching P2P_ESCROW_RELEASE
        // ledger row is written with amount 0 (the seller's spendable total
        // doesn't change). That makes an over-release invisible to
        // wallet/ledger reconciliation, exactly like the settlement job's
        // lock release -- so the write itself must refuse to go negative.
        where: { id: trade.seller.wallet.id, lockedBalance: { gte: trade.tokenAmount } },
        data: { lockedBalance: { decrement: trade.tokenAmount } },
      }),
      this.prisma.wallet.update({
        where: { id: buyerWallet.id },
        data: { balance: { increment: trade.tokenAmount } },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: trade.seller.wallet.id,
          type: LedgerEntryType.P2P_ESCROW_RELEASE,
          amount: 0,
          reference: trade.id,
        },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: buyerWallet.id,
          type: LedgerEntryType.P2P_ESCROW_CREDIT,
          amount: trade.tokenAmount,
          reference: trade.id,
        },
      }),
      this.prisma.p2PTokenTrade.update({
        where: { id: trade.id },
        data: { status: P2PTradeStatus.RELEASED, releasedAt: new Date() },
      }),
      this.prisma.p2PTokenOffer.update({
        where: { id: trade.offerId },
        data: { status: P2POfferStatus.COMPLETED, completedAt: new Date() },
      }),
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

const userSelect = {
  select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true },
};
const tradeInclude = {
  offer: true,
  buyer: userSelect,
  seller: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      p2pPaymentInstructions: true,
    },
  },
  sellerPaymentMethod: true,
  dispute: true,
} satisfies Prisma.P2PTokenTradeInclude;

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function csvIncludes(csv: string, value: string) {
  return parseCsv(csv).includes(value.trim().toUpperCase());
}

function parseCsv(csv: string) {
  return csv
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function isUsdEquivalent(currency: string) {
  return ['USD', 'USDT', 'USDC'].includes(currency.toUpperCase());
}

function roundMoney(value: number) {
  return Number(value.toFixed(8));
}

function serializeSettings(row: Awaited<ReturnType<P2PService['settingsRow']>>) {
  return {
    ...row,
    minTradeTokens: row.minTradeTokens.toString(),
    maxTradeTokens: row.maxTradeTokens.toString(),
  };
}

interface PaymentMethodSummarySource {
  id: string;
  type: string;
  bankName: string | null;
  bankCode: string | null;
  accountNumberMasked: string | null;
  mobileMoneyNetwork: string | null;
  mobileMoneyNumberMasked: string | null;
  stablecoinAsset: string | null;
  stablecoinNetwork: string | null;
  walletAddressMasked: string | null;
  verificationStatus: string;
}

function summarizePaymentMethod(account: PaymentMethodSummarySource) {
  return {
    id: account.id,
    type: account.type,
    label:
      account.type === 'BANK'
        ? `${account.bankName ?? account.bankCode} · ${account.accountNumberMasked}`
        : account.type === 'STABLECOIN_WALLET'
          ? `${account.stablecoinAsset} · ${account.stablecoinNetwork} · ${account.walletAddressMasked}`
          : `${account.mobileMoneyNetwork} · ${account.mobileMoneyNumberMasked}`,
    verified: account.verificationStatus === 'VERIFIED',
  };
}

function serializeOffer(offer: any, includePayment: boolean, completedSaleCount?: number) {
  return {
    id: offer.id,
    type: offer.type,
    userId: offer.userId,
    // Reshaped, not passed through raw -- phoneVerifiedAt/kycStatus are
    // fetched (see listOffers' user select) only to derive the two boolean
    // trust badges below; the raw timestamp/enum value is never exposed to
    // other traders browsing the market.
    user:
      'user' in offer && offer.user
        ? {
            id: offer.user.id,
            email: offer.user.email,
            firstName: offer.user.firstName,
            lastName: offer.user.lastName,
            phoneVerified: !!offer.user.phoneVerifiedAt,
            kycVerified: offer.user.kycStatus === 'APPROVED',
            country: offer.user.country ?? null,
          }
        : undefined,
    // Only populated by listOffers (which batches this via
    // getCompletedSaleCounts) -- other callers of serializeOffer (create/
    // accept/cancel a single offer) don't pay for it since it's only
    // needed for the market list's trader-trust signal.
    completedSaleCount,
    tokenAmount: offer.tokenAmount.toString(),
    remainingTokens: offer.remainingTokens.toString(),
    usdAmount: offer.usdAmount.toString(),
    fiatAmount: offer.fiatAmount.toString(),
    fiatCurrency: offer.fiatCurrency,
    paymentMethod: offer.paymentMethod,
    paymentMethodDetails:
      includePayment && 'paymentMethodRef' in offer ? offer.paymentMethodRef : null,
    // The seller's full set of acceptable receive-accounts, visible to
    // ANY viewer (unlike paymentMethodDetails' owner-only full detail
    // above) -- a buyer needs this summary to pick one when accepting.
    // Deliberately minimal: no encrypted/raw account number, just enough
    // to distinguish options (type/label/verification badge).
    paymentMethods:
      'paymentMethods' in offer && Array.isArray(offer.paymentMethods)
        ? offer.paymentMethods
            .map((row: { payoutAccount?: PaymentMethodSummarySource }) => row.payoutAccount)
            .filter(
              (
                account: PaymentMethodSummarySource | undefined,
              ): account is PaymentMethodSummarySource => Boolean(account),
            )
            .map(summarizePaymentMethod)
        : [],
    status: offer.status,
    expiresAt: offer.expiresAt,
    completedAt: offer.completedAt,
    cancelledAt: offer.cancelledAt,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

const p2pTradeLogger = new Logger('P2PService');

/**
 * A P2P trade's whole point is the buyer paying the seller directly, so
 * once a trade exists, its participants need the REAL account number, not
 * just the accountNumberMasked column PayoutAccount stores for the owner's
 * own "my saved accounts" list (see PayoutAccount's schema doc comment --
 * that masked form is the only thing ordinarily read back for display,
 * since a trainer viewing their own saved account already knows the
 * number; a P2P counterparty does not). Decrypts accountNumberEncryptedJson/
 * mobileMoneyNumberEncryptedJson (AES-256-GCM, same decrypt path admin
 * payout submission uses) on the fly for isParticipant readers only --
 * never persisted anywhere plaintext, never returned to a non-participant.
 * Exposed under new accountNumber/mobileMoneyNumber fields (kept separate
 * from accountNumberMasked/mobileMoneyNumberMasked, not overwritten in
 * place) so nothing downstream can mistake "the field named *Masked" for
 * actually being masked. A decrypt failure (e.g. key rotated, corrupt row)
 * falls back to null rather than 500ing the whole trade view -- the masked
 * field is still present for the UI to fall back to.
 */
function decryptForParticipant(encrypted: unknown): string | null {
  if (!encrypted) return null;
  try {
    return decryptPayoutField(encrypted as EncryptedPayoutField);
  } catch (err) {
    p2pTradeLogger.warn(`Could not decrypt P2P seller account number: ${String(err)}`);
    return null;
  }
}

/**
 * Only the OTHER party's phone number is exposed, and only once a trade
 * exists (a P2P trade's whole point is the two sides coordinating payment,
 * which for most trainers means WhatsApp -- see WhatsAppContactLink's
 * precedent in the WhatsApp Validator integration). A viewer never needs
 * their own number revealed back to them, and a non-participant must
 * never see either side's number at all.
 */
function withPhoneIfViewerIsCounterparty<T extends { phoneNumber: string | null }>(
  user: T,
  isViewer: boolean,
): Omit<T, 'phoneNumber'> & { phoneNumber: string | null } {
  const { phoneNumber, ...rest } = user;
  return { ...rest, phoneNumber: isViewer ? null : phoneNumber };
}

function serializeTrade(
  trade: Prisma.P2PTokenTradeGetPayload<{ include: typeof tradeInclude }>,
  viewerId?: string,
) {
  const isParticipant = viewerId ? trade.buyerId === viewerId || trade.sellerId === viewerId : true;
  // No viewerId at all means an admin-facing call (adminListTrades/
  // adminListDisputes below) -- same "show everything" convention
  // sellerPaymentMethod/sellerPaymentInstructions already use via
  // isParticipant, so both numbers stay visible there. Once a real
  // viewerId is given, only the OTHER party's number is ever revealed --
  // never a viewer's own number back to them, and never either number to
  // a non-participant.
  const buyer = withPhoneIfViewerIsCounterparty(
    trade.buyer,
    !!viewerId && trade.buyerId === viewerId,
  );
  const seller = withPhoneIfViewerIsCounterparty(
    trade.seller,
    !!viewerId && trade.sellerId === viewerId,
  );
  const sellerPaymentMethod =
    isParticipant && trade.sellerPaymentMethod
      ? (() => {
          // Never let the raw encrypted blobs leave the backend -- destructure
          // them out rather than spreading the whole row through.
          const { accountNumberEncryptedJson, mobileMoneyNumberEncryptedJson, ...rest } =
            trade.sellerPaymentMethod;
          return {
            ...rest,
            accountNumber: decryptForParticipant(accountNumberEncryptedJson),
            mobileMoneyNumber: decryptForParticipant(mobileMoneyNumberEncryptedJson),
          };
        })()
      : null;
  return {
    id: trade.id,
    offerId: trade.offerId,
    offerType: trade.offer.type,
    buyerId: trade.buyerId,
    sellerId: trade.sellerId,
    buyer,
    seller,
    tokenAmount: trade.tokenAmount.toString(),
    usdAmount: trade.usdAmount.toString(),
    fiatAmount: trade.fiatAmount.toString(),
    fiatCurrency: trade.fiatCurrency,
    paymentMethod: trade.paymentMethod,
    sellerPaymentMethod,
    sellerPaymentInstructions: isParticipant ? trade.seller.p2pPaymentInstructions : null,
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
