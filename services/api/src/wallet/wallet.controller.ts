import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import {
  BlogPostStatus,
  LedgerEntryType,
  OtpPurpose,
  PayoutMethod,
  Prisma,
  ReferralInviteStatus,
  Role,
  SubmissionStatus,
  SubscriptionPoolStatus,
  UserStatus,
  WithdrawalStatus,
  adjustAdminWallet,
  creditAdminFunding,
  creditFundingReferralBonusesOps,
  creditTrainingPayout,
  debitReserveForFlutterwavePayoutOps,
} from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { OtpService } from '../otp/otp.service';
import { NowPaymentsService } from './nowpayments.service';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwaveV4Service, RecipientCountry } from './flutterwave-v4.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateFlutterwaveDepositDto } from './dto/create-flutterwave-deposit.dto';
import { RequestFlutterwaveDepositOtpDto } from './dto/request-flutterwave-deposit-otp.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { RequestWithdrawalOtpDto } from './dto/request-withdrawal-otp.dto';
import { RequestDepositOtpDto } from './dto/request-deposit-otp.dto';
import { ResolveWithdrawalDto } from './dto/resolve-withdrawal.dto';
import { SubmitWithdrawalPayoutDto } from './dto/submit-withdrawal-payout.dto';
import { VerifyWithdrawalPayoutDto } from './dto/verify-withdrawal-payout.dto';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { CreateTrainingPayoutDto } from './dto/create-training-payout.dto';
import { AdminWalletAdjustmentDto } from './dto/admin-wallet-adjustment.dto';
import { ListEarningsDto } from './dto/list-earnings.dto';
import { ListLeaderboardDto } from './dto/list-leaderboard.dto';
import { GetEarningsChartDto } from './dto/get-earnings-chart.dto';
import { CreateReferralInviteDto } from './dto/create-referral-invite.dto';
import { tokensToUsdt, usdToTokens } from './token-rate.util';
import { tokensToLocalCurrency } from './currency-rate.util';
import {
  withdrawalContextHash,
  depositContextHash,
  adminActionContextHash,
  fiatWithdrawalContextHash,
} from './otp-context.util';
import { decryptPayoutField } from '../common/payout-crypto.util';
import { MailService } from '../mail/mail.service';
import { TokenomicsService } from '../tokenomics/tokenomics.service';

const EARNING_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.TRAINING_PAYOUT,
  LedgerEntryType.REFERRAL_COMMISSION,
  LedgerEntryType.REFERRAL_FUNDING_BONUS,
  LedgerEntryType.REFERRAL_PAYOUT_BONUS,
];

const NOWPAYMENTS_PAYOUT_FINISHED_STATUSES = new Set([
  'finished',
  'paid',
  'complete',
  'completed',
  'success',
]);
const NOWPAYMENTS_PAYOUT_FAILED_STATUSES = new Set([
  'failed',
  'rejected',
  'expired',
  'cancelled',
  'canceled',
]);

// Flutterwave v3 transfer status enum: NEW, PENDING, FAILED, SUCCESSFUL,
// CANCELLED, INITIATED. Anything not in these two sets (NEW/PENDING/
// INITIATED) maps to PROCESSING.
const FLUTTERWAVE_TRANSFER_FINISHED_STATUSES = new Set(['successful']);
const FLUTTERWAVE_TRANSFER_FAILED_STATUSES = new Set(['failed', 'cancelled']);

// Flutterwave v4 transfer status enum: NEW, PENDING, FAILED, SUCCESSFUL,
// CANCELLED, INITIATED -- same 6 values as v3, kept as a separate constant
// (not shared) so a future divergence between the two API versions'
// vocabularies doesn't require re-splitting this later.
const FLUTTERWAVE_V4_TRANSFER_FINISHED_STATUSES = new Set(['successful']);
const FLUTTERWAVE_V4_TRANSFER_FAILED_STATUSES = new Set(['failed', 'cancelled']);

// How many top-ranked rows the dedicated /admin/leaderboard page ranks and
// paginates through -- see buildEarnersRanking's doc comment for why a
// leaderboard trades an exact full-table total for a fast bounded one.
const LEADERBOARD_MAX_ROWS = 200;

function paginateInMemory<T>(rows: T[], page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), page, pageSize, total, totalPages };
}

/**
 * Wallet / Utility Token Pool: users fund their token balance with
 * USDC/USDT via NOWPayments hosted invoices, spend tokens on tasks
 * (elsewhere in the app), and request cash-out back to USDT. See AGENTS.md
 * "Wallet / token pool" and docs/Dialectiva_Business_Plan.md §5 -- this is
 * the Utility Pool only, funded by users; the separate Reward/Bonus Pool
 * (enterprise-funded accuracy bonuses) is out of scope here.
 *
 * Every balance mutation happens inside a Prisma $transaction alongside its
 * LedgerEntry -- the ledger is the source of truth, Wallet.balance is a
 * denormalized cache of it. Never update balance without a matching entry.
 */
@Controller()
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nowPayments: NowPaymentsService,
    private readonly flutterwave: FlutterwaveService,
    private readonly flutterwaveV4: FlutterwaveV4Service,
    private readonly platformSettings: PlatformSettingsService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly tokenomics?: TokenomicsService,
  ) {}

  private async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.prisma.wallet.create({ data: { userId } });
  }

  private async getCurrentTokenUsdRate() {
    return this.tokenomics?.getCurrentPublishedValue() ?? this.platformSettings.getTokenUsdRate();
  }

  private async getReferralSettings() {
    return this.prisma.referralSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  /** Display-only local-currency context for the requesting user's country -- null when the user has no country yet (pre-onboarding) or no rate has been fetched. */
  private async getLocalCurrency(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        country: {
          select: { currencyCode: true, usdExchangeRate: true, exchangeRateUpdatedAt: true },
        },
      },
    });
    if (!user?.country || user.country.usdExchangeRate === null) {
      return null;
    }
    return {
      code: user.country.currencyCode,
      usdExchangeRate: user.country.usdExchangeRate.toString(),
      updatedAt: user.country.exchangeRateUpdatedAt,
    };
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: AuthenticatedRequest) {
    const [wallet, tokenUsdRate, localCurrency, taskTokenCost] = await Promise.all([
      this.getOrCreateWallet(req.user.sub),
      this.getCurrentTokenUsdRate(),
      this.getLocalCurrency(req.user.sub),
      this.platformSettings.getTaskTokenCost(),
    ]);
    return {
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      tokenUsdRate,
      taskTokenCost: taskTokenCost.toString(),
      localCurrency,
      balanceInLocalCurrency: localCurrency
        ? tokensToLocalCurrency(
            wallet.balance.toNumber(),
            tokenUsdRate,
            Number(localCurrency.usdExchangeRate),
          ).toString()
        : null,
    };
  }

  @Post('wallet/referrals/invite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async sendReferralInvite(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateReferralInviteDto,
  ): Promise<void> {
    const inviter = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { firstName: true, lastName: true, email: true, referralCode: true },
    });
    if (!inviter) {
      throw new NotFoundException('User not found');
    }

    if (inviter.email.toLowerCase() === dto.email.toLowerCase()) {
      throw new BadRequestException('You cannot invite your own email address');
    }

    // An already-registered email can never be (re-)invited -- they've
    // either already joined a network or have none, but either way a new
    // invite for them makes no sense (see AGENTS.md-style rule: "once
    // registered, cannot be invited again").
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException('This email is already registered');
    }

    const inviterName =
      [inviter.firstName, inviter.lastName].filter(Boolean).join(' ').trim() || inviter.email;
    const frontend = process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
    const referralUrl = `${frontend}/register?ref=${encodeURIComponent(inviter.referralCode)}`;
    const inviteExpirySeconds = await this.platformSettings.getReferralInviteExpirySeconds();
    const expiresAt = new Date(Date.now() + inviteExpirySeconds * 1000);

    // Upsert on (inviterId, email): a repeat invite from the SAME inviter to
    // the same email reactivates/extends the existing row rather than
    // erroring or duplicating it. Different inviters each get their own row
    // for the same email -- that's expected (see schema doc comment).
    await this.prisma.referralInvite.upsert({
      where: { inviterId_email: { inviterId: req.user.sub, email: dto.email } },
      create: { inviterId: req.user.sub, email: dto.email, firstName: dto.firstName, expiresAt },
      update: {
        firstName: dto.firstName,
        status: ReferralInviteStatus.INVITED,
        joinedUserId: null,
        expiresAt,
      },
    });

    await this.mail.sendReferralInviteEmail({
      inviterName,
      inviterEmail: inviter.email,
      inviteeFirstName: dto.firstName,
      inviteeEmail: dto.email,
      referralUrl,
    });
  }

  @Get('wallet/dashboard')
  @UseGuards(JwtAuthGuard)
  async getTrainerDashboard(@Req() req: AuthenticatedRequest) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5, 1);
    sixMonthsAgo.setUTCHours(0, 0, 0, 0);

    const [
      user,
      settings,
      ledgerTotals,
      recentActivity,
      earningsHistory,
      withdrawalTotals,
      pendingInvites,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: {
          referralCode: true,
          referrals: {
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: { id: true, firstName: true, email: true, createdAt: true },
          },
          _count: { select: { referrals: true } },
        },
      }),
      this.getReferralSettings(),
      this.prisma.ledgerEntry.groupBy({
        by: ['type'],
        where: { walletId: wallet.id },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, amount: true, reference: true, createdAt: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          walletId: wallet.id,
          type: {
            in: [
              'TRAINING_PAYOUT',
              'REFERRAL_COMMISSION',
              'REFERRAL_FUNDING_BONUS',
              'REFERRAL_PAYOUT_BONUS',
            ],
          },
          createdAt: { gte: sixMonthsAgo },
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.withdrawalRequest.groupBy({
        by: ['status'],
        where: { walletId: wallet.id },
        _sum: { tokenAmount: true },
      }),
      this.getPendingReferralInvites(req.user.sub),
    ]);

    const ledgerAmount = (types: string[]) =>
      ledgerTotals
        .filter((entry) => types.includes(entry.type))
        .reduce((total, entry) => total + Number(entry._sum.amount ?? 0), 0);
    const withdrawalAmount = (status: WithdrawalStatus) =>
      Number(withdrawalTotals.find((entry) => entry.status === status)?._sum.tokenAmount ?? 0);

    const monthTotals = new Map<string, number>();
    for (let offset = 0; offset < 6; offset += 1) {
      const month = new Date(
        Date.UTC(sixMonthsAgo.getUTCFullYear(), sixMonthsAgo.getUTCMonth() + offset, 1),
      );
      monthTotals.set(month.toISOString().slice(0, 7), 0);
    }
    for (const entry of earningsHistory) {
      const key = entry.createdAt.toISOString().slice(0, 7);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(entry.amount));
    }

    // Batched rather than sequential awaits -- each of these previously hit
    // PlatformSettingsService.getRow() (a Prisma upsert) one at a time,
    // turning this endpoint into 6+ round-trips end to end. getRow() now
    // also caches briefly on its own, but running the calls concurrently
    // still collapses this to a single wait even on a cache miss.
    const [
      dashboardTokenUsdRate,
      dashboardLocalCurrency,
      taskTokenCost,
      scoringSlaMinutes,
      recordingRoundTimeoutSeconds,
      recordingRoundMaxTimeoutSeconds,
      cookiePersistSeconds,
      inviteExpirySeconds,
      minWithdrawalTokens,
    ] = await Promise.all([
      this.getCurrentTokenUsdRate(),
      this.getLocalCurrency(req.user.sub),
      this.platformSettings.getTaskTokenCost(),
      this.platformSettings.getScoringSlaMinutes(),
      this.platformSettings.getWordTrainingRecordingTimeoutSeconds(),
      this.platformSettings.getWordTrainingRecordingMaxTimeoutSeconds(),
      this.platformSettings.getReferralCookiePersistSeconds(),
      this.platformSettings.getReferralInviteExpirySeconds(),
      this.platformSettings.getMinWithdrawalTokens(),
    ]);

    return {
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      tokenUsdRate: dashboardTokenUsdRate,
      taskTokenCost: taskTokenCost.toString(),
      scoringSlaMinutes,
      recordingRoundTimeoutSeconds,
      recordingRoundMaxTimeoutSeconds,
      minWithdrawalTokens: minWithdrawalTokens.toString(),
      localCurrency: dashboardLocalCurrency,
      balanceInLocalCurrency: dashboardLocalCurrency
        ? tokensToLocalCurrency(
            wallet.balance.toNumber(),
            dashboardTokenUsdRate,
            Number(dashboardLocalCurrency.usdExchangeRate),
          ).toString()
        : null,
      fundedTokens: ledgerAmount(['DEPOSIT']).toString(),
      trainingEarningsTokens: ledgerAmount(['TRAINING_PAYOUT']).toString(),
      referralEarningsTokens: ledgerAmount([
        'REFERRAL_COMMISSION',
        'REFERRAL_FUNDING_BONUS',
        'REFERRAL_PAYOUT_BONUS',
      ]).toString(),
      paidOutTokens: withdrawalAmount(WithdrawalStatus.PAID).toString(),
      pendingPayoutTokens: withdrawalAmount(WithdrawalStatus.PENDING).toString(),
      recentActivity: recentActivity.map((entry) => ({
        ...entry,
        amount: entry.amount.toString(),
      })),
      monthlyEarnings: Array.from(monthTotals, ([month, amount]) => ({
        month,
        amount: amount.toString(),
      })),
      referrals: {
        code: user.referralCode,
        invitedCount: user._count.referrals,
        recentInvites: this.mergeRecentInvites(user.referrals, pendingInvites),
        cookiePersistSeconds,
        inviteExpirySeconds,
        fundingBonusRate: settings.fundingBonusRate.toString(),
        fundingBonusEnabled: settings.fundingBonusEnabled,
        payoutBonusRate: settings.payoutBonusRate.toString(),
        payoutBonusEnabled: settings.payoutBonusEnabled,
      },
    };
  }

  /**
   * Lazily deletes this inviter's expired pending invites before returning the
   * remaining ones -- expired invites are never surfaced as "expired" in
   * the dashboard, they just disappear from the list.
   */
  private async getPendingReferralInvites(inviterId: string) {
    const now = new Date();
    await this.prisma.referralInvite.deleteMany({
      where: { inviterId, status: ReferralInviteStatus.INVITED, expiresAt: { lte: now } },
    });
    return this.prisma.referralInvite.findMany({
      where: { inviterId, status: ReferralInviteStatus.INVITED, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, firstName: true, email: true, createdAt: true },
    });
  }

  /**
   * Combines actually-registered referred users (status JOINED, from
   * User.referredById -- covers both the explicit Invite CTA and someone
   * just sharing/copying their referral link) with still-pending
   * ReferralInvite rows (status INVITED) into one list, newest first.
   * JOINED ReferralInvite rows are intentionally excluded here -- once
   * joined, the person already appears via the real User record, so
   * including the invite row too would duplicate them.
   */
  private mergeRecentInvites(
    joined: { id: string; firstName: string | null; email: string; createdAt: Date }[],
    pending: { id: string; firstName: string; email: string; createdAt: Date }[],
  ) {
    const merged = [
      ...joined.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        email: row.email,
        createdAt: row.createdAt,
        status: 'JOINED' as const,
      })),
      ...pending.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        email: row.email,
        createdAt: row.createdAt,
        status: 'INVITED' as const,
      })),
    ];
    merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return merged.slice(0, 8);
  }

  /**
   * Earnings bucketed for the dashboard chart: week -> 7 daily buckets,
   * month -> 30 daily buckets, year -> 12 monthly buckets. Same earning
   * ledger types as wallet/dashboard's monthlyEarnings, just re-bucketed on
   * demand instead of fixed to a trailing 6 months.
   */
  @Get('wallet/earnings-chart')
  @UseGuards(JwtAuthGuard)
  async getEarningsChart(@Req() req: AuthenticatedRequest, @Query() query: GetEarningsChartDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const now = new Date();
    const isYear = query.range === 'year';
    const dayCount = query.range === 'week' ? 7 : query.range === 'month' ? 30 : 0;

    const since = isYear
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
      : new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (dayCount - 1)),
        );
    since.setUTCHours(0, 0, 0, 0);

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        walletId: wallet.id,
        type: { in: EARNING_ENTRY_TYPES },
        createdAt: { gte: since },
      },
      select: { amount: true, createdAt: true },
    });

    const buckets = new Map<string, number>();
    if (isYear) {
      for (let offset = 0; offset < 12; offset += 1) {
        const month = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + offset, 1));
        buckets.set(month.toISOString().slice(0, 7), 0);
      }
      for (const entry of entries) {
        const key = entry.createdAt.toISOString().slice(0, 7);
        buckets.set(key, (buckets.get(key) ?? 0) + Number(entry.amount));
      }
    } else {
      for (let offset = 0; offset < dayCount; offset += 1) {
        const day = new Date(
          Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate() + offset),
        );
        buckets.set(day.toISOString().slice(0, 10), 0);
      }
      for (const entry of entries) {
        const key = entry.createdAt.toISOString().slice(0, 10);
        buckets.set(key, (buckets.get(key) ?? 0) + Number(entry.amount));
      }
    }

    return {
      range: query.range,
      buckets: Array.from(buckets, ([label, amount]) => ({ label, amount: amount.toString() })),
    };
  }

  @Get('wallet/earnings')
  @UseGuards(JwtAuthGuard)
  async listEarnings(@Req() req: AuthenticatedRequest, @Query() query: ListEarningsDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const where: Prisma.LedgerEntryWhereInput = {
      walletId: wallet.id,
      type: { in: EARNING_ENTRY_TYPES },
    };
    const skip = (query.page - 1) * query.pageSize;
    const [entries, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        select: { id: true, type: true, amount: true, reference: true, createdAt: true },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return {
      items: entries.map((entry) => ({ ...entry, amount: entry.amount.toString() })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  @Get('wallet/activity')
  @UseGuards(JwtAuthGuard)
  async listActivity(@Req() req: AuthenticatedRequest, @Query() query: ListEarningsDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const where: Prisma.LedgerEntryWhereInput = { walletId: wallet.id };
    const skip = (query.page - 1) * query.pageSize;
    const [entries, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        select: { id: true, type: true, amount: true, reference: true, createdAt: true },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return {
      items: entries.map((entry) => ({ ...entry, amount: entry.amount.toString() })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  @Post('wallet/deposits/otp')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async requestDepositOtp(@Req() req: AuthenticatedRequest, @Body() body: RequestDepositOtpDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const contextHash = depositContextHash({ usdAmount: body.usdAmount, currency: body.currency });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.DEPOSIT, user.email, contextHash);
  }

  @Post('wallet/deposits')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async createDeposit(@Req() req: AuthenticatedRequest, @Body() body: CreateDepositDto) {
    await this.otp.verify({
      otpRequestId: body.otpRequestId,
      userId: req.user.sub,
      purpose: OtpPurpose.DEPOSIT,
      code: body.code,
      contextHash: depositContextHash({ usdAmount: body.usdAmount, currency: body.currency }),
    });

    const wallet = await this.getOrCreateWallet(req.user.sub);
    const rate = await this.getCurrentTokenUsdRate();
    const tokenAmount = usdToTokens(body.usdAmount, rate);

    const deposit = await this.prisma.deposit.create({
      data: {
        walletId: wallet.id,
        provider: 'nowpayments',
        providerChargeId: `pending-${randomUUID()}`, // replaced once NOWPayments returns a real invoice id
        currency: body.currency,
        usdAmount: body.usdAmount,
        tokenAmount,
        status: 'pending',
      },
    });

    const apiBaseUrl = process.env.API_PUBLIC_BASE_URL ?? 'https://api.dialectlibrary.com';
    const ipnCallbackUrl = new URL('/api/v1/wallet/webhooks/nowpayments', apiBaseUrl).toString();
    let invoice;
    try {
      invoice = await this.nowPayments.createInvoice({
        usdAmount: body.usdAmount,
        payCurrency: body.currency,
        orderId: deposit.id,
        orderDescription: `Dialect Library token top-up: ${body.usdAmount} USD -> ${tokenAmount.toFixed(2)} tokens`,
        ipnCallbackUrl,
      });
    } catch (err) {
      await this.prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'failed' } });
      throw err;
    }

    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: { providerChargeId: invoice.invoiceId },
    });

    return { depositId: deposit.id, hostedCheckoutUrl: invoice.invoiceUrl };
  }

  @Post('wallet/deposits/flutterwave/otp')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async requestFlutterwaveDepositOtp(
    @Req() req: AuthenticatedRequest,
    @Body() body: RequestFlutterwaveDepositOtpDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    // Same context-hash shape as the crypto deposit flow -- usdAmount and
    // currency are what economically matter, so this reuses
    // depositContextHash as-is rather than a Flutterwave-specific variant.
    const contextHash = depositContextHash({ usdAmount: body.usdAmount, currency: body.currency });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.DEPOSIT, user.email, contextHash);
  }

  /**
   * Sibling to createDeposit (which stays NOWPayments-only) rather than a
   * branch inside it -- keeps each provider's request/response shape
   * independently typed, matching the withdrawal side's
   * submit-nowpayments/submit-flutterwave sibling pattern. The trainer's
   * usdAmount stays the accounting-of-record figure (deposit/withdrawal
   * accounting is USD-denominated throughout this codebase, see
   * currency-rate.util.ts's doc comment); it is converted to the target
   * fiat currency only at the point of calling Flutterwave, using
   * Country.usdExchangeRate, since Flutterwave charges the user in their
   * local currency.
   */
  @Post('wallet/deposits/flutterwave')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async createFlutterwaveDeposit(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateFlutterwaveDepositDto,
  ) {
    if (!(await this.platformSettings.isFlutterwaveFundingEnabled())) {
      throw new UnprocessableEntityException('Fiat funding is currently disabled');
    }

    await this.otp.verify({
      otpRequestId: body.otpRequestId,
      userId: req.user.sub,
      purpose: OtpPurpose.DEPOSIT,
      code: body.code,
      contextHash: depositContextHash({ usdAmount: body.usdAmount, currency: body.currency }),
    });

    const allowedCurrencies = await this.platformSettings.getAllowedFlutterwaveCurrencies();
    if (!allowedCurrencies.includes(body.currency.toUpperCase())) {
      throw new UnprocessableEntityException(`${body.currency} is not an allowed funding currency`);
    }
    const allowedCountries = await this.platformSettings.getAllowedFlutterwaveCountries();
    if (!allowedCountries.includes(body.country.toUpperCase())) {
      throw new UnprocessableEntityException(`${body.country} is not an allowed funding country`);
    }

    const country = await this.prisma.country.findUnique({ where: { code: body.country } });
    if (!country?.usdExchangeRate) {
      throw new UnprocessableEntityException(
        'No exchange rate is available for this country yet -- try again shortly',
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.sub },
      select: { firstName: true, lastName: true, phoneNumber: true },
    });

    const wallet = await this.getOrCreateWallet(req.user.sub);
    const rate = await this.getCurrentTokenUsdRate();
    const tokenAmount = usdToTokens(body.usdAmount, rate);
    const localAmount = body.usdAmount * country.usdExchangeRate.toNumber();

    const deposit = await this.prisma.deposit.create({
      data: {
        walletId: wallet.id,
        provider: 'flutterwave',
        providerChargeId: `pending-${randomUUID()}`, // replaced once we have a real tx_ref
        currency: body.currency,
        usdAmount: body.usdAmount,
        tokenAmount,
        status: 'pending',
      },
    });

    const frontend = process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
    const redirectUrl = new URL('/wallet/funding/flutterwave/callback', frontend).toString();
    const txRef = `deposit-${deposit.id}`;

    if (await this.platformSettings.isFlutterwaveV4Enabled()) {
      // Query param name Flutterwave itself appends on redirect is not
      // confirmed for v4's auth_redirect scenario, so the deposit id is
      // embedded directly in our own redirect_url instead of relying on
      // any echoed-back reference -- the callback page reads it straight
      // from its own query string, no guessing required.
      const v4RedirectUrl = new URL(redirectUrl);
      v4RedirectUrl.searchParams.set('depositId', deposit.id);
      v4RedirectUrl.searchParams.set('provider', 'flutterwave-v4');
      return this.createFlutterwaveV4Deposit({
        req,
        body,
        user,
        deposit,
        localAmount,
        redirectUrl: v4RedirectUrl.toString(),
        reference: txRef,
      });
    }

    let payment;
    try {
      payment = await this.flutterwave.createPayment({
        amount: Number(localAmount.toFixed(2)),
        currency: body.currency.toUpperCase(),
        txRef,
        redirectUrl,
        customerEmail: req.user.email,
        customerName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        customerPhone: user.phoneNumber ?? undefined,
      });
    } catch (err) {
      await this.prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'failed' } });
      throw err;
    }

    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: { providerChargeId: txRef },
    });

    return { depositId: deposit.id, hostedCheckoutUrl: payment.link };
  }

  /**
   * v4 funding: no hosted-checkout-link, no card. Bank transfer returns a
   * generated virtual account (frontend shows it inline, trainer transfers
   * manually, checkFlutterwaveDepositStatus polls); mobile money creates a
   * payment_method + charge with the auth_redirect scenario, so the trainer
   * still gets a redirect URL to send them to Flutterwave and land back on
   * the existing callback page -- see FlutterwaveV4Service's doc comment
   * for why card isn't an option here.
   */
  private async createFlutterwaveV4Deposit(params: {
    req: AuthenticatedRequest;
    body: CreateFlutterwaveDepositDto;
    user: { firstName: string | null; lastName: string | null; phoneNumber: string | null };
    deposit: { id: string };
    localAmount: number;
    redirectUrl: string;
    reference: string;
  }) {
    const { req, body, user, deposit, localAmount, redirectUrl, reference } = params;
    const currency = body.currency.toUpperCase();

    try {
      let customerId = (
        await this.prisma.user.findUniqueOrThrow({
          where: { id: req.user.sub },
          select: { flutterwaveCustomerId: true },
        })
      ).flutterwaveCustomerId;
      if (!customerId) {
        const created = await this.flutterwaveV4.createCustomer({
          email: req.user.email,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          phoneNumber: user.phoneNumber ?? undefined,
        });
        customerId = created.customerId;
        await this.prisma.user.update({
          where: { id: req.user.sub },
          data: { flutterwaveCustomerId: customerId },
        });
      }

      if (body.method === 'mobile_money') {
        if (!body.mobileMoneyNetwork || !body.mobileMoneyNumber) {
          throw new UnprocessableEntityException(
            'mobileMoneyNetwork and mobileMoneyNumber are required for a mobile money deposit',
          );
        }
        const charge = await this.flutterwaveV4.createMobileMoneyCharge({
          customerId,
          network: body.mobileMoneyNetwork,
          countryCode: body.country,
          phoneNumber: body.mobileMoneyNumber,
          amount: Number(localAmount.toFixed(2)),
          currency,
          reference,
          redirectUrl,
        });
        await this.prisma.deposit.update({
          where: { id: deposit.id },
          data: { provider: 'flutterwave-v4', providerChargeId: charge.chargeId },
        });
        return { depositId: deposit.id, redirectUrl: charge.redirectUrl };
      }

      const virtualAccount = await this.flutterwaveV4.createVirtualAccount({
        customerId,
        amount: Number(localAmount.toFixed(2)),
        currency,
        reference,
        narration: `Dialect Library DL funding ${deposit.id}`,
      });
      await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: { provider: 'flutterwave-v4', providerChargeId: reference },
      });
      return {
        depositId: deposit.id,
        virtualAccount: {
          accountNumber: virtualAccount.accountNumber,
          bankName: virtualAccount.bankName,
          note: virtualAccount.note,
        },
      };
    } catch (err) {
      await this.prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'failed' } });
      throw err;
    }
  }

  /**
   * Manual poll for the v4 bank-transfer path (JC-6 in the migration plan
   * -- there's no redirect to return from, so the frontend calls this after
   * the trainer confirms they've sent the transfer). Shares
   * creditFlutterwaveDeposit with the v3/webhook paths -- it's keyed off
   * Deposit.status, not provider version, so a deposit only ever gets
   * credited once regardless of which path resolves it first.
   */
  @Post('wallet/deposits/flutterwave/:id/check-status')
  @UseGuards(JwtAuthGuard)
  async checkFlutterwaveDepositStatus(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!deposit || deposit.wallet.userId !== req.user.sub || deposit.provider !== 'flutterwave-v4') {
      throw new NotFoundException('Deposit not found');
    }
    if (deposit.status === 'confirmed') {
      return { depositId: deposit.id, status: 'confirmed', credited: true };
    }

    const charge = await this.flutterwaveV4.getCharge(deposit.providerChargeId);
    if (charge.status !== 'succeeded') {
      return { depositId: deposit.id, status: charge.status ?? 'pending', credited: false };
    }

    const result = await this.creditFlutterwaveDeposit(deposit.id, {
      flutterwaveTxId: charge.chargeId,
      txRef: deposit.providerChargeId,
      status: charge.status,
    });
    return { depositId: deposit.id, status: 'confirmed', credited: result };
  }

  /**
   * Belt-and-suspenders alongside the webhook (doc SS32: "never credit
   * funding based only on frontend redirect success") -- the frontend
   * callback page calls this after Flutterwave redirects back, re-verifying
   * server-side via the same reference the deposit was created with. Either
   * this call or the webhook may arrive first; both funnel through the same
   * status!=='confirmed' guard, so whichever lands first credits and the
   * other becomes a no-op.
   */
  @Get('wallet/deposits/flutterwave/:id/verify')
  @UseGuards(JwtAuthGuard)
  async verifyFlutterwaveDeposit(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!deposit || deposit.wallet.userId !== req.user.sub) {
      throw new NotFoundException('Deposit not found');
    }
    if (deposit.status === 'confirmed') {
      return { depositId: deposit.id, status: 'confirmed', credited: true };
    }

    const verification = await this.flutterwave.verifyPaymentByReference(deposit.providerChargeId);
    if (verification.status !== 'successful') {
      return { depositId: deposit.id, status: verification.status ?? 'pending', credited: false };
    }

    const result = await this.creditFlutterwaveDeposit(deposit.id, verification);
    return { depositId: deposit.id, status: 'confirmed', credited: result };
  }

  /**
   * NOWPayments can't send a JWT, so this route carries no JwtAuthGuard --
   * trust is instead established by verifying the HMAC-SHA512 signature
   * over the alphabetically-key-sorted JSON body (see
   * NowPaymentsService.verifyIpnSignature). Unlike Coinbase Commerce's
   * raw-byte HMAC, this verifies against the already-parsed body, so no
   * raw-body middleware is needed here -- Nest's default body parser is
   * fine. `order_id` is the Deposit.id we set when creating the invoice,
   * which is how this correlates back to a specific deposit (NOWPayments
   * has no equivalent of Coinbase's arbitrary `metadata` field, so
   * order_id is deliberately set to deposit.id, not a separate order
   * number).
   */
  @Post('wallet/webhooks/nowpayments')
  @HttpCode(HttpStatus.OK)
  async handleNowPaymentsWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-nowpayments-sig') signature?: string,
  ) {
    if (!this.nowPayments.verifyIpnSignature(body, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const paymentStatus = ipnString(body.payment_status)?.toLowerCase();
    const depositId = ipnString(body.order_id);
    const providerPaymentId = ipnString(body.payment_id);
    const eventHash = this.nowPayments.getIpnEventHash(body);
    const event = await this.prisma.nowPaymentsIpnEvent.upsert({
      where: { eventHash },
      update: {},
      create: {
        eventHash,
        orderId: depositId,
        providerPaymentId,
        paymentStatus,
        payload: body as Prisma.InputJsonValue,
      },
    });

    if (event.processedAt) {
      return { received: true, duplicate: true };
    }

    if (!paymentStatus || !depositId) {
      await this.completeIpnEvent(event.id, 'Missing payment_status or order_id');
      return { received: true, matched: false };
    }

    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: { wallet: { include: { user: true } } },
    });
    if (!deposit) {
      this.logger.warn(`NOWPayments IPN did not match a deposit: order_id=${depositId}`);
      await this.completeIpnEvent(event.id, 'Deposit not found');
      return { received: true, matched: false };
    }

    const validationError = validateFinishedPayment(
      body,
      deposit.providerChargeId,
      deposit.usdAmount.toString(),
    );
    if (paymentStatus === 'finished' && validationError) {
      this.logger.error(
        `Rejected finished NOWPayments IPN for deposit=${deposit.id}: ${validationError}`,
      );
      await this.completeIpnEvent(event.id, validationError, deposit.id);
      return { received: true, credited: false };
    }

    const now = new Date();
    const actuallyPaid = ipnNumber(body.actually_paid);
    const depositMetadata: Prisma.DepositUpdateManyMutationInput = {
      providerPaymentId,
      providerStatus: paymentStatus,
      lastIpnAt: now,
      payCurrency: ipnString(body.pay_currency),
      ...(actuallyPaid !== undefined ? { actuallyPaid } : {}),
    };

    if (paymentStatus !== 'finished') {
      const nextStatus = localDepositStatus(paymentStatus);
      await this.prisma.$transaction([
        this.prisma.deposit.updateMany({
          where: { id: deposit.id, status: { not: 'confirmed' } },
          data: { ...depositMetadata, ...(nextStatus ? { status: nextStatus } : {}) },
        }),
        this.prisma.nowPaymentsIpnEvent.update({
          where: { id: event.id },
          data: { depositId: deposit.id, processedAt: now },
        }),
      ]);
      this.logger.log(
        `NOWPayments IPN status=${paymentStatus} deposit=${deposit.id} credited=false`,
      );
      return { received: true, credited: false, status: paymentStatus };
    }

    const fundingBonuses = await creditFundingReferralBonusesOps(
      this.prisma,
      deposit.wallet.user.id,
      deposit.tokenAmount,
      deposit.id,
    );

    const credited = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.deposit.updateMany({
        where: { id: deposit.id, status: { not: 'confirmed' } },
        data: { ...depositMetadata, status: 'confirmed', confirmedAt: now },
      });

      if (claimed.count === 0) {
        await tx.nowPaymentsIpnEvent.update({
          where: { id: event.id },
          data: { depositId: deposit.id, processedAt: now },
        });
        return false;
      }

      await tx.ledgerEntry.create({
        data: {
          walletId: deposit.walletId,
          type: 'DEPOSIT',
          amount: deposit.tokenAmount,
          reference: deposit.id,
        },
      });
      await tx.wallet.update({
        where: { id: deposit.walletId },
        data: { balance: { increment: deposit.tokenAmount } },
      });

      // The provider payment is an immutable reserve event. Wallet credit is
      // retained for compatibility during the token-account cut-over, while
      // reserve accounting is written in the same transaction as the IPN.
      if (this.tokenomics) {
        await this.tokenomics.recordConfirmedNowPaymentsDepositTx(tx, {
          depositId: deposit.id,
          providerChargeId: deposit.providerChargeId,
          providerPaymentId,
          currency: deposit.currency,
          usdAmount: deposit.usdAmount,
          actuallyPaid,
          payCurrency: ipnString(body.pay_currency),
        });
      }

      for (const entry of fundingBonuses.entries) {
        await tx.ledgerEntry.create({ data: entry });
        await tx.wallet.update({
          where: { id: entry.walletId },
          data: { balance: { increment: entry.amount } },
        });
      }

      await tx.nowPaymentsIpnEvent.update({
        where: { id: event.id },
        data: { depositId: deposit.id, processedAt: now },
      });
      return true;
    });

    this.logger.log(
      `NOWPayments IPN status=${paymentStatus} deposit=${deposit.id} credited=${credited}`,
    );
    return { received: true, credited, status: paymentStatus };
  }

  private async completeIpnEvent(eventId: string, processingError: string, depositId?: string) {
    await this.prisma.nowPaymentsIpnEvent.update({
      where: { id: eventId },
      data: { depositId, processedAt: new Date(), processingError },
    });
  }

  /**
   * No JwtAuthGuard -- Flutterwave can't send a JWT, trust comes from
   * verifyWebhookSignature instead (see flutterwave.service.ts's doc
   * comment on the two header schemes it checks). Needs the raw request
   * body (main.ts's `rawBody: true`), not the parsed one, since
   * Flutterwave's HMAC-SHA256 signature is documented as being computed
   * over raw bytes -- unlike NOWPayments' IPN signature, which verifies
   * against a re-serialized, sorted parsed body and needs no raw body at
   * all. Handles both charge (funding) and transfer (payout) event types
   * on one URL, since that's the typical single-webhook Flutterwave
   * dashboard setup.
   */
  @Post('wallet/webhooks/flutterwave')
  @HttpCode(HttpStatus.OK)
  async handleFlutterwaveWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw request body');
    }
    const headers: Record<string, string | undefined> = {
      'verif-hash': req.headers['verif-hash'] as string | undefined,
      'flutterwave-signature': req.headers['flutterwave-signature'] as string | undefined,
    };
    if (!this.flutterwave.verifyWebhookSignature(rawBody, headers)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body as Record<string, unknown>;
    const eventType = flwString(body.event);
    const data = body.data as Record<string, unknown> | undefined;

    if (eventType === 'transfer.completed') {
      return this.handleFlutterwaveTransferWebhook(rawBody, eventType, data);
    }

    if (eventType !== 'charge.completed' || !data) {
      return { received: true, matched: false };
    }

    const txRef = flwString(data.tx_ref);
    const flutterwaveTxId = flwString(data.id);
    const status = flwString(data.status)?.toLowerCase();
    const eventHash = this.flutterwave.getWebhookEventHash(rawBody);

    const event = await this.prisma.flutterwaveWebhookEvent.upsert({
      where: { eventHash },
      update: {},
      create: {
        eventHash,
        txRef,
        flutterwaveTxId,
        eventType,
        providerStatus: status,
        payload: body as Prisma.InputJsonValue,
      },
    });
    if (event.processedAt) {
      return { received: true, duplicate: true };
    }

    if (!txRef || status !== 'successful') {
      await this.completeFlutterwaveWebhookEvent(event.id, undefined, 'Not a successful charge');
      return { received: true, matched: false };
    }

    const deposit = await this.prisma.deposit.findUnique({
      where: { providerChargeId: txRef },
    });
    if (!deposit) {
      this.logger.warn(`Flutterwave webhook did not match a deposit: tx_ref=${txRef}`);
      await this.completeFlutterwaveWebhookEvent(event.id, undefined, 'Deposit not found');
      return { received: true, matched: false };
    }

    const credited = await this.creditFlutterwaveDeposit(deposit.id, {
      flutterwaveTxId: flutterwaveTxId ?? txRef,
      txRef,
      status: status ?? null,
    });
    await this.completeFlutterwaveWebhookEvent(event.id, deposit.id);
    this.logger.log(
      `Flutterwave webhook status=${status} deposit=${deposit.id} credited=${credited}`,
    );
    return { received: true, credited, status };
  }

  private async completeFlutterwaveWebhookEvent(
    eventId: string,
    depositId?: string,
    processingError?: string,
  ) {
    await this.prisma.flutterwaveWebhookEvent.update({
      where: { id: eventId },
      data: { depositId, processedAt: new Date(), processingError },
    });
  }

  /**
   * v4 counterpart to handleFlutterwaveWebhook -- separate route (not a
   * branch inside the v3 handler) because the signature scheme and event
   * vocabulary genuinely differ: v4 only sends flutterwave-signature (no
   * legacy verif-hash fallback), funding fires "charge.completed" same as
   * v3, but payouts fire "transfer.disburse"/"transfer.reversal", not v3's
   * "transfer.completed". Writes to the separate FlutterwaveV4ChargeEvent/
   * FlutterwaveV4TransferEvent tables, same upsert-by-eventHash dedup
   * pattern as the v3 handler.
   */
  @Post('wallet/webhooks/flutterwave-v4')
  @HttpCode(HttpStatus.OK)
  async handleFlutterwaveV4Webhook(@Req() req: Request & { rawBody?: Buffer }) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw request body');
    }
    const headers: Record<string, string | undefined> = {
      'flutterwave-signature': req.headers['flutterwave-signature'] as string | undefined,
    };
    if (!this.flutterwaveV4.verifyWebhookSignature(rawBody, headers)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body as Record<string, unknown>;
    const eventType = flwString(body.type) ?? flwString(body.event);
    const data = body.data as Record<string, unknown> | undefined;

    if (eventType === 'transfer.disburse' || eventType === 'transfer.reversal') {
      return this.handleFlutterwaveV4TransferWebhook(rawBody, eventType, data);
    }

    if (eventType !== 'charge.completed' || !data) {
      return { received: true, matched: false };
    }

    const reference = flwString(data.reference);
    const chargeId = flwString(data.id);
    const status = flwString(data.status)?.toLowerCase();
    const eventHash = this.flutterwaveV4.getWebhookEventHash(rawBody);

    const event = await this.prisma.flutterwaveV4ChargeEvent.upsert({
      where: { eventHash },
      update: {},
      create: {
        eventHash,
        chargeId,
        reference,
        eventType,
        providerStatus: status,
        payload: body as Prisma.InputJsonValue,
      },
    });
    if (event.processedAt) {
      return { received: true, duplicate: true };
    }

    if (!reference || status !== 'succeeded') {
      await this.completeFlutterwaveV4ChargeEvent(event.id, undefined, 'Not a succeeded charge');
      return { received: true, matched: false };
    }

    const deposit = await this.prisma.deposit.findUnique({
      where: { providerChargeId: reference },
    });
    if (!deposit) {
      this.logger.warn(`Flutterwave v4 webhook did not match a deposit: reference=${reference}`);
      await this.completeFlutterwaveV4ChargeEvent(event.id, undefined, 'Deposit not found');
      return { received: true, matched: false };
    }

    const credited = await this.creditFlutterwaveDeposit(deposit.id, {
      flutterwaveTxId: chargeId ?? reference,
      txRef: reference,
      status: status ?? null,
    });
    await this.completeFlutterwaveV4ChargeEvent(event.id, deposit.id);
    this.logger.log(
      `Flutterwave v4 webhook status=${status} deposit=${deposit.id} credited=${credited}`,
    );
    return { received: true, credited, status };
  }

  private async completeFlutterwaveV4ChargeEvent(
    eventId: string,
    depositId?: string,
    processingError?: string,
  ) {
    await this.prisma.flutterwaveV4ChargeEvent.update({
      where: { id: eventId },
      data: { depositId, processedAt: new Date(), processingError },
    });
  }

  private async handleFlutterwaveV4TransferWebhook(
    rawBody: Buffer,
    eventType: string,
    data: Record<string, unknown> | undefined,
  ) {
    const transferId = flwString(data?.id);
    const reference = flwString(data?.reference);
    const status = flwString(data?.status)?.toLowerCase();
    const eventHash = this.flutterwaveV4.getWebhookEventHash(rawBody);

    const event = await this.prisma.flutterwaveV4TransferEvent.upsert({
      where: { eventHash },
      update: {},
      create: {
        eventHash,
        transferId,
        reference,
        eventType,
        providerStatus: status,
        payload: (data ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (!reference) {
      return { received: true, matched: false };
    }
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: reference },
    });
    if (!withdrawal) {
      this.logger.warn(
        `Flutterwave v4 transfer webhook did not match a withdrawal: reference=${reference}`,
      );
      return { received: true, matched: false };
    }

    await this.prisma.flutterwaveV4TransferEvent.update({
      where: { id: event.id },
      data: { withdrawalRequestId: withdrawal.id },
    });
    await this.recordFlutterwaveV4PayoutStatus(
      withdrawal.id,
      transferId ?? withdrawal.providerPayoutId ?? '',
      eventType,
      status ?? null,
      data ?? {},
    );
    this.logger.log(`Flutterwave v4 transfer webhook status=${status} withdrawal=${withdrawal.id}`);
    return { received: true, status };
  }

  /**
   * Payout-side counterpart to the charge.completed branch above -- dedupes
   * via FlutterwavePayoutEvent.eventHash (a distinct table from
   * FlutterwaveWebhookEvent, matching how NOWPayments already keeps its
   * IPN/payout event tables separate), looks up WithdrawalRequest by
   * reference (== WithdrawalRequest.id, as set in createTransfer's params),
   * and reuses recordFlutterwavePayoutStatus so a webhook delivery and a
   * manual refresh-flutterwave poll converge on the exact same status
   * mapping/write path.
   */
  private async handleFlutterwaveTransferWebhook(
    rawBody: Buffer,
    eventType: string,
    data: Record<string, unknown> | undefined,
  ) {
    const transferId = flwString(data?.id);
    const reference = flwString(data?.reference);
    const status = flwString(data?.status)?.toLowerCase();
    const eventHash = this.flutterwave.getWebhookEventHash(rawBody);

    const event = await this.prisma.flutterwavePayoutEvent.upsert({
      where: { eventHash },
      update: {},
      create: {
        eventHash,
        withdrawalRequestId: undefined,
        providerPayoutId: transferId,
        eventType,
        providerStatus: status,
        payload: (data ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (!reference) {
      return { received: true, matched: false };
    }
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: reference },
    });
    if (!withdrawal) {
      this.logger.warn(
        `Flutterwave transfer webhook did not match a withdrawal: reference=${reference}`,
      );
      return { received: true, matched: false };
    }

    await this.prisma.flutterwavePayoutEvent.update({
      where: { id: event.id },
      data: { withdrawalRequestId: withdrawal.id },
    });
    await this.recordFlutterwavePayoutStatus(
      withdrawal.id,
      transferId ?? withdrawal.providerPayoutId ?? '',
      'webhook',
      status ?? null,
      data ?? {},
    );
    this.logger.log(`Flutterwave transfer webhook status=${status} withdrawal=${withdrawal.id}`);
    return { received: true, status };
  }

  /**
   * Shared by the webhook and the frontend-redirect verify endpoint -- both
   * arrive at "a provider-confirmed successful payment for this deposit,"
   * whichever gets there first credits, the other is a no-op via the
   * status!=='confirmed' atomic claim (same updateMany-guarded pattern
   * NOWPayments' handler uses).
   */
  private async creditFlutterwaveDeposit(
    depositId: string,
    verification: { flutterwaveTxId: string; txRef: string | null; status: string | null },
  ): Promise<boolean> {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({
      where: { id: depositId },
      include: { wallet: { include: { user: true } } },
    });

    const fundingBonuses = await creditFundingReferralBonusesOps(
      this.prisma,
      deposit.wallet.user.id,
      deposit.tokenAmount,
      deposit.id,
    );

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.deposit.updateMany({
        where: { id: deposit.id, status: { not: 'confirmed' } },
        data: {
          status: 'confirmed',
          confirmedAt: now,
          providerPaymentId: verification.flutterwaveTxId,
          providerStatus: verification.status,
          lastIpnAt: now,
        },
      });
      if (claimed.count === 0) {
        return false;
      }

      await tx.ledgerEntry.create({
        data: {
          walletId: deposit.walletId,
          type: 'DEPOSIT',
          amount: deposit.tokenAmount,
          reference: deposit.id,
        },
      });
      await tx.wallet.update({
        where: { id: deposit.walletId },
        data: { balance: { increment: deposit.tokenAmount } },
      });

      if (this.tokenomics) {
        await this.tokenomics.recordConfirmedFlutterwaveDepositTx(tx, {
          depositId: deposit.id,
          flutterwaveTxId: verification.flutterwaveTxId,
          txRef: deposit.providerChargeId,
          currency: deposit.currency,
          usdAmount: deposit.usdAmount,
        });
      }

      for (const entry of fundingBonuses.entries) {
        await tx.ledgerEntry.create({ data: entry });
        await tx.wallet.update({
          where: { id: entry.walletId },
          data: { balance: { increment: entry.amount } },
        });
      }

      return true;
    });
  }

  /** Shared PENDING withdrawal preconditions -- kill switch, minimum, allow-listed currency/network, verified contact. */
  private async validateWithdrawalRequest(
    userId: string,
    tokenAmount: number,
    destinationCurrency: string,
    destinationNetwork: string,
  ): Promise<void> {
    if (!(await this.platformSettings.isCryptoWithdrawalsEnabled())) {
      throw new UnprocessableEntityException('Crypto withdrawals are currently disabled');
    }
    const minTokens = await this.platformSettings.getMinWithdrawalTokens();
    if (tokenAmount < minTokens) {
      throw new UnprocessableEntityException(`Minimum withdrawal is ${minTokens} tokens`);
    }
    const [allowedCurrencies, allowedNetworks] = await Promise.all([
      this.platformSettings.getAllowedWithdrawalCurrencies(),
      this.platformSettings.getAllowedWithdrawalNetworks(),
    ]);
    if (!allowedCurrencies.includes(destinationCurrency.toUpperCase())) {
      throw new UnprocessableEntityException(
        `${destinationCurrency} is not an allowed withdrawal currency`,
      );
    }
    if (!allowedNetworks.includes(destinationNetwork.toUpperCase())) {
      throw new UnprocessableEntityException(
        `${destinationNetwork} is not an allowed withdrawal network`,
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerified) {
      throw new UnprocessableEntityException('Verify your email before requesting a withdrawal');
    }
    // Only enforced while phoneVerificationRequired is on -- when off,
    // withdrawals still keep their own per-transaction WITHDRAWAL email OTP
    // (requestWithdrawalOtp/createWithdrawal below), so there's no gap.
    if ((await this.platformSettings.isPhoneVerificationRequired()) && !user.phoneVerifiedAt) {
      throw new UnprocessableEntityException(
        'Verify your phone number before requesting a withdrawal',
      );
    }
    await this.requireKycIfNeeded(user.kycStatus, tokenAmount);
  }

  /**
   * Shared by validateWithdrawalRequest and validateFiatWithdrawalRequest --
   * both already have `user` in hand from their own findUniqueOrThrow call,
   * so this takes the already-fetched kycStatus rather than re-querying.
   */
  private async requireKycIfNeeded(kycStatus: string, tokenAmount: number): Promise<void> {
    if (!(await this.platformSettings.isKycRequiredForWithdrawals())) return;
    const kycMinTokens = await this.platformSettings.getKycMinWithdrawalTokens();
    if (tokenAmount < kycMinTokens) return;
    if (kycStatus !== 'APPROVED') {
      throw new UnprocessableEntityException(
        'Complete identity verification before requesting a withdrawal',
      );
    }
  }

  /**
   * Fiat counterpart to validateWithdrawalRequest -- parallel rather than a
   * branch inside the same method, since the checks genuinely differ
   * (allowed currency/country vs allowed currency/network) and mixing them
   * risks a currency check silently applying to the wrong provider's
   * allow-list. Resolves and returns the trainer's own PayoutAccount so
   * callers don't re-fetch it.
   */
  private async validateFiatWithdrawalRequest(
    userId: string,
    tokenAmount: number,
    payoutAccountId: string,
  ) {
    if (!(await this.platformSettings.isFlutterwavePayoutsEnabled())) {
      throw new UnprocessableEntityException('Fiat withdrawals are currently disabled');
    }
    const minTokens = await this.platformSettings.getMinWithdrawalTokens();
    if (tokenAmount < minTokens) {
      throw new UnprocessableEntityException(`Minimum withdrawal is ${minTokens} tokens`);
    }

    const payoutAccount = await this.prisma.payoutAccount.findUnique({
      where: { id: payoutAccountId },
    });
    if (!payoutAccount || payoutAccount.userId !== userId) {
      throw new NotFoundException('Payout account not found');
    }
    const [allowedCurrencies, allowedCountries] = await Promise.all([
      this.platformSettings.getAllowedFlutterwaveCurrencies(),
      this.platformSettings.getAllowedFlutterwaveCountries(),
    ]);
    if (!allowedCurrencies.includes(payoutAccount.currency.toUpperCase())) {
      throw new UnprocessableEntityException(
        `${payoutAccount.currency} is not an allowed withdrawal currency`,
      );
    }
    if (!allowedCountries.includes(payoutAccount.country.toUpperCase())) {
      throw new UnprocessableEntityException(
        `${payoutAccount.country} is not an allowed withdrawal country`,
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerified) {
      throw new UnprocessableEntityException('Verify your email before requesting a withdrawal');
    }
    if ((await this.platformSettings.isPhoneVerificationRequired()) && !user.phoneVerifiedAt) {
      throw new UnprocessableEntityException(
        'Verify your phone number before requesting a withdrawal',
      );
    }
    await this.requireKycIfNeeded(user.kycStatus, tokenAmount);

    return payoutAccount;
  }

  /**
   * Fiat withdrawals stay USD-denominated in the ledger, but Flutterwave
   * receives the local-currency amount. Snapshot both the converted amount
   * and rate at request time so an FX refresh cannot change an approved
   * payout or make the admin table disagree with the provider submission.
   */
  private async getFiatWithdrawalConversion(
    destinationCountry: string,
    destinationCurrency: string,
    usdAmount: number | Prisma.Decimal,
  ) {
    const country = await this.prisma.country.findUnique({
      where: { code: destinationCountry.toUpperCase() },
      select: { currencyCode: true, usdExchangeRate: true },
    });
    if (!country?.usdExchangeRate) {
      throw new UnprocessableEntityException(
        'No exchange rate is available for this payout country yet -- try again shortly',
      );
    }
    if (country.currencyCode.toUpperCase() !== destinationCurrency.toUpperCase()) {
      throw new UnprocessableEntityException(
        'The payout account currency does not match its country currency configuration',
      );
    }

    const rate = country.usdExchangeRate;
    return {
      fiatAmount: new Prisma.Decimal(usdAmount).mul(rate).toDecimalPlaces(2),
      fiatUsdExchangeRate: rate,
    };
  }

  @Post('wallet/withdrawals/otp')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async requestWithdrawalOtp(
    @Req() req: AuthenticatedRequest,
    @Body() body: RequestWithdrawalOtpDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });

    if (body.payoutMethod && body.payoutMethod !== 'CRYPTO') {
      await this.validateFiatWithdrawalRequest(
        req.user.sub,
        body.tokenAmount,
        body.payoutAccountId!,
      );
      const contextHash = fiatWithdrawalContextHash({
        tokenAmount: body.tokenAmount,
        payoutAccountId: body.payoutAccountId!,
      });
      return this.otp.issueForUser(req.user.sub, OtpPurpose.WITHDRAWAL, user.email, contextHash);
    }

    const destinationCurrency = body.destinationCurrency ?? 'USDT';
    const destinationNetwork = body.destinationNetwork ?? 'TRC20';
    await this.validateWithdrawalRequest(
      req.user.sub,
      body.tokenAmount,
      destinationCurrency,
      destinationNetwork,
    );

    const contextHash = withdrawalContextHash({
      tokenAmount: body.tokenAmount,
      destinationAddress: body.destinationAddress!,
      destinationCurrency,
      destinationNetwork,
    });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.WITHDRAWAL, user.email, contextHash);
  }

  @Post('wallet/withdrawals')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async createWithdrawal(@Req() req: AuthenticatedRequest, @Body() body: CreateWithdrawalDto) {
    const isFiat = Boolean(body.payoutMethod && body.payoutMethod !== 'CRYPTO');
    const destinationCurrency = body.destinationCurrency ?? 'USDT';
    const destinationNetwork = body.destinationNetwork ?? 'TRC20';

    let payoutAccount: Awaited<ReturnType<typeof this.validateFiatWithdrawalRequest>> | null = null;
    let otpRow: { id: string };
    if (isFiat) {
      payoutAccount = await this.validateFiatWithdrawalRequest(
        req.user.sub,
        body.tokenAmount,
        body.payoutAccountId!,
      );
      otpRow = await this.otp.verifyWithoutConsuming({
        otpRequestId: body.otpRequestId,
        userId: req.user.sub,
        purpose: OtpPurpose.WITHDRAWAL,
        code: body.code,
        contextHash: fiatWithdrawalContextHash({
          tokenAmount: body.tokenAmount,
          payoutAccountId: body.payoutAccountId!,
        }),
      });
    } else {
      await this.validateWithdrawalRequest(
        req.user.sub,
        body.tokenAmount,
        destinationCurrency,
        destinationNetwork,
      );
      // Read-only validation here; the actual consume write joins the debit
      // transaction below so a crash between "OTP consumed" and "debit
      // applied" can't happen. contextHash re-derived from the submitted
      // body (not trusted from the client) -- a mismatch means this code
      // was issued for a different amount/destination/currency/network
      // than what's being submitted now, which is exactly the
      // tamper/replay case this binding closes.
      otpRow = await this.otp.verifyWithoutConsuming({
        otpRequestId: body.otpRequestId,
        userId: req.user.sub,
        purpose: OtpPurpose.WITHDRAWAL,
        code: body.code,
        contextHash: withdrawalContextHash({
          tokenAmount: body.tokenAmount,
          destinationAddress: body.destinationAddress!,
          destinationCurrency,
          destinationNetwork,
        }),
      });
    }

    const wallet = await this.getOrCreateWallet(req.user.sub);
    const rate = await this.getCurrentTokenUsdRate();
    const usdtAmount = tokensToUsdt(body.tokenAmount, rate);
    const fiatConversion = payoutAccount
      ? await this.getFiatWithdrawalConversion(
          payoutAccount.country,
          payoutAccount.currency,
          usdtAmount,
        )
      : null;
    const withdrawalId = randomUUID();

    // A snapshot of the PayoutAccount's resolved details onto the
    // WithdrawalRequest row at request time, not a live join -- a later
    // edit/delete of the PayoutAccount must never retroactively change a
    // pending withdrawal's destination, matching how destinationCurrency/
    // destinationNetwork already snapshot the crypto path's chosen values
    // rather than referencing a live config row.
    const fiatSnapshot = payoutAccount
      ? {
          payoutMethod:
            payoutAccount.type === 'BANK' ? PayoutMethod.BANK : PayoutMethod.MOBILE_MONEY,
          payoutAccountId: payoutAccount.id,
          destinationCountry: payoutAccount.country,
          ...(payoutAccount.type === 'BANK'
            ? {
                destinationBankCode: payoutAccount.bankCode,
                destinationBankName: payoutAccount.bankName,
                destinationAccountNumberEncryptedJson: payoutAccount.accountNumberEncryptedJson as
                  Prisma.InputJsonValue | undefined,
                destinationAccountNumberMasked: payoutAccount.accountNumberMasked,
                destinationAccountName: payoutAccount.accountName,
              }
            : {
                destinationMobileNetwork: payoutAccount.mobileMoneyNetwork,
                destinationMobileNumberEncryptedJson:
                  payoutAccount.mobileMoneyNumberEncryptedJson as Prisma.InputJsonValue | undefined,
                destinationMobileNumberMasked: payoutAccount.mobileMoneyNumberMasked,
              }),
        }
      : {};

    // updateMany's WHERE (not just a read-then-compare) is what makes this
    // safe under concurrent requests -- two simultaneous withdrawal calls
    // against the same wallet can't both pass a balance check taken before
    // either debit lands, because the balance>=amount condition is
    // evaluated atomically by Postgres as part of the row lock/update, not
    // read separately beforehand.
    const [debit] = await this.prisma.$transaction([
      this.prisma.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: body.tokenAmount } },
        data: { balance: { decrement: body.tokenAmount } },
      }),
      this.prisma.withdrawalRequest.create({
        data: {
          id: withdrawalId,
          walletId: wallet.id,
          tokenAmount: body.tokenAmount,
          usdtAmount,
          destinationAddress: isFiat ? '' : body.destinationAddress!,
          destinationCurrency: isFiat ? payoutAccount!.currency : destinationCurrency,
          destinationNetwork: isFiat ? '' : destinationNetwork,
          status: WithdrawalStatus.PENDING,
          ...(fiatConversion ?? {}),
          ...fiatSnapshot,
        },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: -body.tokenAmount,
          reference: withdrawalId,
        },
      }),
      this.prisma.otpCode.update({ where: { id: otpRow.id }, data: { consumedAt: new Date() } }),
    ]);

    if (debit.count === 0) {
      // Nothing was decremented -- balance was insufficient. Prisma
      // transactions don't support conditional rollback mid-array, so the
      // WithdrawalRequest/LedgerEntry/OtpCode writes above still happened;
      // undo the withdrawal/ledger rows explicitly rather than leaving a
      // phantom pending request. The OTP stays consumed deliberately (not
      // rolled back) -- a code is single-use regardless of whether the
      // underlying withdrawal succeeded, so a failed attempt can't be
      // retried with the same code (forces a fresh /otp request, which
      // re-validates the minimum-withdrawal/context correctly for a retry).
      await this.prisma.$transaction([
        this.prisma.withdrawalRequest.delete({ where: { id: withdrawalId } }),
        this.prisma.ledgerEntry.deleteMany({ where: { reference: withdrawalId } }),
      ]);
      throw new UnprocessableEntityException('Insufficient balance');
    }

    return { withdrawalId, status: WithdrawalStatus.PENDING };
  }

  @Get('wallet/withdrawals')
  @UseGuards(JwtAuthGuard)
  async listOwnWithdrawals(@Req() req: AuthenticatedRequest) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    return this.prisma.withdrawalRequest.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('admin/withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listWithdrawalsForAdmin(@Query('status') status?: WithdrawalStatus) {
    // Explicit select rather than a bare findMany -- the destination*
    // EncryptedJson columns must never reach the client, even to an admin;
    // decryption only ever happens server-side at submit-flutterwave's call
    // site.
    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        walletId: true,
        wallet: { include: { user: { select: { email: true } } } },
        tokenAmount: true,
        usdtAmount: true,
        destinationAddress: true,
        destinationCurrency: true,
        destinationNetwork: true,
        status: true,
        approvedByAdminId: true,
        approvedAt: true,
        provider: true,
        providerPayoutId: true,
        providerStatus: true,
        providerCurrency: true,
        providerNetwork: true,
        providerAddress: true,
        providerError: true,
        submittedToProviderAt: true,
        providerSettledAt: true,
        adminNote: true,
        createdAt: true,
        resolvedAt: true,
        payoutMethod: true,
        payoutAccountId: true,
        destinationBankCode: true,
        destinationBankName: true,
        destinationAccountNumberMasked: true,
        destinationAccountName: true,
        destinationMobileNetwork: true,
        destinationMobileNumberMasked: true,
        destinationCountry: true,
        fiatAmount: true,
        fiatUsdExchangeRate: true,
      },
    });
  }

  /**
   * One OTP purpose serves approve/resolve/submit -- all are "this admin
   * authorizes moving this withdrawal's funds" actions, and the context
   * hash (id + amount + currency + address + network) already prevents an
   * OTP issued for one withdrawal from validating a different one or a
   * since-changed destination. `action: 'withdrawal'` distinguishes this
   * whole family from the unrelated training-payout OTP purpose.
   */
  @Post('admin/withdrawals/:id/resolve/otp')
  @UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async requestResolveWithdrawalOtp(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUniqueOrThrow({ where: { id } });
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const contextHash = adminActionContextHash({
      action: 'withdrawal',
      id,
      tokenAmount: withdrawal.tokenAmount.toNumber(),
      destinationCurrency: withdrawal.destinationCurrency,
      destinationAddress: withdrawal.destinationAddress,
      destinationNetwork: withdrawal.destinationNetwork,
    });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  /**
   * The human checkpoint (payout-automation plan point 1/3): an admin
   * reviews user/amount/currency/address/network/id and explicitly greenlights
   * this withdrawal before any provider call is made. Separate from
   * submission so "approved" and "actually sent to NOWPayments" are always
   * distinguishable in the status history, and so a stuck/slow provider
   * doesn't retroactively make it look like nobody reviewed the request.
   */
  @Post('admin/withdrawals/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async approveWithdrawal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitWithdrawalPayoutDto,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (
      withdrawal.status !== WithdrawalStatus.PENDING &&
      withdrawal.status !== WithdrawalStatus.FAILED
    ) {
      throw new UnprocessableEntityException('Only pending or failed withdrawals can be approved');
    }

    if (withdrawal.status === WithdrawalStatus.FAILED) {
      // Re-approving a FAILED withdrawal must never re-debit the trainer --
      // the original request already took the tokens out of their balance
      // (createWithdrawal's WITHDRAWAL ledger entry) and a failed provider
      // submission does not refund them (that only happens via reject,
      // which writes a WITHDRAWAL_REVERSED entry). This just re-verifies
      // that original debit is still intact and hasn't been reversed by
      // some other path before letting the retry proceed against it.
      const reversed = await this.prisma.ledgerEntry.findFirst({
        where: { reference: id, type: 'WITHDRAWAL_REVERSED' },
        select: { id: true },
      });
      if (reversed) {
        throw new UnprocessableEntityException(
          'This withdrawal was already refunded to the trainer and cannot be re-approved',
        );
      }
    }

    await this.verifyAdminPayoutOtpIfEnabled(
      req.user.sub,
      withdrawal,
      body.otpRequestId,
      body.code,
    );

    const approved = await this.prisma.withdrawalRequest.update({
      where: { id },
      data: {
        status: WithdrawalStatus.APPROVED,
        approvedByAdminId: req.user.sub,
        approvedAt: new Date(),
        adminNote: body.adminNote,
      },
    });
    this.logger.log(`Withdrawal approved: admin=${req.user.sub} withdrawal=${id}`);

    if (await this.platformSettings.isAutoSubmitAfterApprovalEnabled()) {
      return withdrawal.payoutMethod === PayoutMethod.CRYPTO
        ? this.submitWithdrawalToNowPayments(req, id, body)
        : this.submitWithdrawalToFlutterwave(req, id, body);
    }

    return { withdrawalId: id, status: approved.status };
  }

  @Post('admin/withdrawals/:id/submit-nowpayments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async submitWithdrawalToNowPayments(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitWithdrawalPayoutDto,
  ) {
    if (!(await this.platformSettings.isNowPaymentsPayoutsEnabled())) {
      throw new UnprocessableEntityException('NOWPayments payouts are currently disabled');
    }

    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      // FAILED withdrawals must go back through approve (a fresh, logged,
      // OTP-gated checkpoint) rather than being resubmitted directly here --
      // a create call whose response was lost to a network error may have
      // still reached NOWPayments, so silently retrying create risks a
      // second real payout. Forcing re-approval makes that retry a
      // deliberate, audited admin decision instead of a same-click resend.
      throw new UnprocessableEntityException(
        'Only approved withdrawals can be submitted to NOWPayments -- re-approve failed withdrawals before retrying',
      );
    }
    if (withdrawal.providerPayoutId) {
      return this.refreshNowPaymentsWithdrawalStatus(id);
    }

    await this.verifyAdminPayoutOtpIfEnabled(
      req.user.sub,
      withdrawal,
      body.otpRequestId,
      body.code,
    );

    // Atomically claim the row before calling out to NOWPayments -- the
    // WHERE clause (status still APPROVED, no providerPayoutId yet) is
    // evaluated by Postgres as part of the row lock/update, so two
    // concurrent submit calls for the same withdrawal (double-click, two
    // admin tabs) can't both pass this check and both create a real
    // provider-side payout. Only the request that wins this update
    // proceeds to createPayout.
    const claim = await this.prisma.withdrawalRequest.updateMany({
      where: { id, status: WithdrawalStatus.APPROVED, providerPayoutId: null },
      data: { providerStatus: 'submitting' },
    });
    if (claim.count === 0) {
      throw new UnprocessableEntityException(
        'This withdrawal is already being submitted or was already submitted',
      );
    }

    try {
      const payout = await this.nowPayments.createPayout({
        withdrawalId: withdrawal.id,
        address: withdrawal.destinationAddress,
        currency: withdrawal.destinationCurrency as 'USDT' | 'USDC',
        amount: withdrawal.usdtAmount.toNumber(),
      });
      await this.prisma.$transaction([
        this.prisma.withdrawalRequest.update({
          where: { id },
          data: {
            status: this.mapProviderPayoutStatus(payout.status),
            provider: 'nowpayments',
            providerPayoutId: payout.payoutId,
            providerStatus: payout.status ?? 'created',
            providerCurrency: withdrawal.destinationCurrency,
            providerNetwork: withdrawal.destinationNetwork,
            providerAddress: withdrawal.destinationAddress,
            providerPayload: payout.raw as Prisma.InputJsonValue,
            providerError: null,
            submittedToProviderAt: new Date(),
            providerSettledAt: this.isProviderPayoutFinished(payout.status) ? new Date() : null,
            resolvedAt: this.isProviderPayoutFinished(payout.status) ? new Date() : null,
            adminNote: body.adminNote,
          },
        }),
        this.prisma.nowPaymentsPayoutEvent.create({
          data: {
            eventHash: randomUUID(),
            withdrawalRequestId: id,
            providerPayoutId: payout.payoutId,
            eventType: 'create',
            providerStatus: payout.status,
            payload: payout.raw as Prisma.InputJsonValue,
          },
        }),
      ]);
      this.logger.log(
        `Withdrawal submitted to NOWPayments: admin=${req.user.sub} withdrawal=${id} providerPayoutId=${payout.payoutId}`,
      );

      if (body.verificationCode) {
        return this.verifyNowPaymentsWithdrawalPayout(req, id, {
          verificationCode: body.verificationCode,
        });
      }

      return {
        withdrawalId: id,
        status: this.mapProviderPayoutStatus(payout.status),
        providerPayoutId: payout.payoutId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.FAILED,
          provider: 'nowpayments',
          providerError: message,
          adminNote: body.adminNote,
        },
      });
      await this.prisma.nowPaymentsPayoutEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: id,
          eventType: 'create_failed',
          payload: { message },
          processingError: message,
        },
      });
      this.logger.error(
        `Withdrawal submit-to-NOWPayments failed: admin=${req.user.sub} withdrawal=${id}: ${message}`,
      );
      throw err;
    }
  }

  @Post('admin/withdrawals/:id/verify-nowpayments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async verifyNowPaymentsWithdrawalPayout(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: VerifyWithdrawalPayoutDto,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (!withdrawal.providerPayoutId) {
      throw new UnprocessableEntityException('Withdrawal has not been submitted to NOWPayments');
    }

    const result = await this.nowPayments.verifyPayout(
      withdrawal.providerPayoutId,
      body.verificationCode,
    );
    await this.recordNowPaymentsPayoutStatus(
      id,
      result.payoutId,
      'verify',
      result.status,
      result.raw,
    );
    this.logger.log(
      `Withdrawal payout verified: admin=${req.user.sub} withdrawal=${id} providerStatus=${result.status ?? 'unknown'}`,
    );
    return {
      withdrawalId: id,
      status: this.mapProviderPayoutStatus(result.status),
      providerPayoutId: result.payoutId,
    };
  }

  @Post('admin/withdrawals/:id/refresh-nowpayments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async refreshNowPaymentsWithdrawalStatus(@Param('id') id: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (!withdrawal.providerPayoutId) {
      throw new UnprocessableEntityException('Withdrawal has not been submitted to NOWPayments');
    }

    const result = await this.nowPayments.getPayoutStatus(withdrawal.providerPayoutId);
    await this.recordNowPaymentsPayoutStatus(
      id,
      result.payoutId,
      'status',
      result.status,
      result.raw,
    );
    return {
      withdrawalId: id,
      status: this.mapProviderPayoutStatus(result.status),
      providerPayoutId: result.payoutId,
    };
  }

  @Post('admin/withdrawals/:id/submit-flutterwave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async submitWithdrawalToFlutterwave(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SubmitWithdrawalPayoutDto,
  ) {
    if (!(await this.platformSettings.isFlutterwavePayoutsEnabled())) {
      throw new UnprocessableEntityException('Flutterwave payouts are currently disabled');
    }

    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      // Same reasoning as submit-nowpayments: a FAILED withdrawal must go
      // back through approve (a fresh, logged, OTP-gated checkpoint)
      // rather than being resubmitted directly here.
      throw new UnprocessableEntityException(
        'Only approved withdrawals can be submitted to Flutterwave -- re-approve failed withdrawals before retrying',
      );
    }
    if (withdrawal.providerPayoutId) {
      return this.refreshFlutterwaveWithdrawalStatus(id);
    }
    if (withdrawal.payoutMethod === PayoutMethod.CRYPTO) {
      throw new UnprocessableEntityException('This withdrawal is not a fiat payout');
    }

    await this.verifyAdminPayoutOtpIfEnabled(
      req.user.sub,
      withdrawal,
      body.otpRequestId,
      body.code,
    );

    // Same atomic-claim pattern as submit-nowpayments -- only the request
    // that wins this update proceeds to createTransfer.
    const claim = await this.prisma.withdrawalRequest.updateMany({
      where: { id, status: WithdrawalStatus.APPROVED, providerPayoutId: null },
      data: { providerStatus: 'submitting' },
    });
    if (claim.count === 0) {
      throw new UnprocessableEntityException(
        'This withdrawal is already being submitted or was already submitted',
      );
    }

    if (await this.platformSettings.isFlutterwaveV4Enabled()) {
      return this.submitWithdrawalToFlutterwaveV4(req, id, withdrawal, body);
    }

    try {
      // Re-resolve the bank account immediately before transferring (JC-8)
      // -- bank details can go stale between the request-time snapshot and
      // submit time. A mismatched resolved name requires manual admin
      // review rather than silently proceeding. No resolve equivalent is
      // confirmed for mobile money in Flutterwave v3, so this check only
      // applies to BANK withdrawals.
      let accountNumber: string;
      if (withdrawal.destinationBankCode && withdrawal.destinationAccountNumberEncryptedJson) {
        accountNumber = decryptPayoutField(
          withdrawal.destinationAccountNumberEncryptedJson as unknown as {
            encryptedValue: string;
            iv: string;
            authTag: string;
          },
        );
        const resolved = await this.flutterwave.resolveAccount({
          accountBank: withdrawal.destinationBankCode,
          accountNumber,
        });
        if (resolved.accountName !== withdrawal.destinationAccountName) {
          throw new UnprocessableEntityException(
            'The resolved account name no longer matches the saved payout account -- manual review required before this payout can proceed',
          );
        }
      } else if (
        withdrawal.destinationMobileNetwork &&
        withdrawal.destinationMobileNumberEncryptedJson
      ) {
        accountNumber = decryptPayoutField(
          withdrawal.destinationMobileNumberEncryptedJson as unknown as {
            encryptedValue: string;
            iv: string;
            authTag: string;
          },
        );
      } else {
        throw new UnprocessableEntityException('Withdrawal is missing fiat destination details');
      }

      if (!withdrawal.fiatAmount && !withdrawal.destinationCountry) {
        throw new UnprocessableEntityException(
          'Withdrawal is missing its payout country and cannot be converted to fiat',
        );
      }
      const fiatConversion = withdrawal.fiatAmount
        ? {
            fiatAmount: withdrawal.fiatAmount,
            fiatUsdExchangeRate: withdrawal.fiatUsdExchangeRate,
          }
        : await this.getFiatWithdrawalConversion(
            withdrawal.destinationCountry!,
            withdrawal.destinationCurrency,
            withdrawal.usdtAmount,
          );
      const transfer = await this.flutterwave.createTransfer({
        accountBank: withdrawal.destinationBankCode ?? withdrawal.destinationMobileNetwork!,
        accountNumber,
        amount: fiatConversion.fiatAmount.toNumber(),
        currency: withdrawal.destinationCurrency,
        narration: `Dialect Library trainer payout: ${withdrawal.id}`,
        reference: withdrawal.id,
        beneficiaryName: withdrawal.destinationAccountName ?? undefined,
      });

      await this.prisma.$transaction([
        this.prisma.withdrawalRequest.update({
          where: { id },
          data: {
            status: this.mapFlutterwaveTransferStatus(transfer.status),
            provider: 'flutterwave',
            providerPayoutId: transfer.transferId,
            providerStatus: transfer.status ?? 'created',
            providerPayload: transfer.raw as Prisma.InputJsonValue,
            providerError: null,
            // Legacy fiat rows did not retain their conversion. Persist the
            // one resolved above before recording the provider submission.
            ...(withdrawal.fiatAmount ? {} : fiatConversion),
            submittedToProviderAt: new Date(),
            providerSettledAt: this.isFlutterwaveTransferFinished(transfer.status)
              ? new Date()
              : null,
            resolvedAt: this.isFlutterwaveTransferFinished(transfer.status) ? new Date() : null,
            adminNote: body.adminNote,
          },
        }),
        this.prisma.flutterwavePayoutEvent.create({
          data: {
            eventHash: randomUUID(),
            withdrawalRequestId: id,
            providerPayoutId: transfer.transferId,
            eventType: 'create',
            providerStatus: transfer.status,
            payload: transfer.raw as Prisma.InputJsonValue,
          },
        }),
      ]);
      this.logger.log(
        `Withdrawal submitted to Flutterwave: admin=${req.user.sub} withdrawal=${id} providerPayoutId=${transfer.transferId}`,
      );

      return {
        withdrawalId: id,
        status: this.mapFlutterwaveTransferStatus(transfer.status),
        providerPayoutId: transfer.transferId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.FAILED,
          provider: 'flutterwave',
          providerError: message,
          adminNote: body.adminNote,
        },
      });
      await this.prisma.flutterwavePayoutEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: id,
          eventType: 'create_failed',
          payload: { message },
          processingError: message,
        },
      });
      this.logger.error(
        `Withdrawal submit-to-Flutterwave failed: admin=${req.user.sub} withdrawal=${id}: ${message}`,
      );
      throw err;
    }
  }

  /**
   * v4 payout submission: lazily creates/reuses PayoutAccount.
   * providerRecipientId (JC-5 in the migration plan) and the one-time
   * platform Sender (cached on PlatformSettings.flutterwaveV4SenderId),
   * then submits the transfer. Bank-account-name re-verification stays on
   * v3's resolveAccount (see JC-5's note: v4 recipient creation doesn't
   * verify the account holder's name the way v3's resolveAccount does), so
   * that check is kept even under the v4 toggle. Mirrors the atomic-claim/
   * try-catch-mark-FAILED shape of the v3 method it's called from.
   */
  private async submitWithdrawalToFlutterwaveV4(
    req: AuthenticatedRequest,
    id: string,
    withdrawal: NonNullable<Awaited<ReturnType<typeof this.prisma.withdrawalRequest.findUnique>>>,
    body: SubmitWithdrawalPayoutDto,
  ) {
    try {
      if (!withdrawal.payoutAccountId) {
        throw new UnprocessableEntityException(
          'This withdrawal has no saved payout account to submit under Flutterwave v4',
        );
      }
      const payoutAccount = await this.prisma.payoutAccount.findUniqueOrThrow({
        where: { id: withdrawal.payoutAccountId },
      });

      let accountNumber: string | undefined;
      if (payoutAccount.type === 'BANK' && payoutAccount.accountNumberEncryptedJson) {
        accountNumber = decryptPayoutField(
          payoutAccount.accountNumberEncryptedJson as unknown as {
            encryptedValue: string;
            iv: string;
            authTag: string;
          },
        );
        const resolved = await this.flutterwave.resolveAccount({
          accountBank: payoutAccount.bankCode!,
          accountNumber,
        });
        if (resolved.accountName !== payoutAccount.accountName) {
          throw new UnprocessableEntityException(
            'The resolved account name no longer matches the saved payout account -- manual review required before this payout can proceed',
          );
        }
      } else if (
        payoutAccount.type === 'MOBILE_MONEY' &&
        payoutAccount.mobileMoneyNumberEncryptedJson
      ) {
        accountNumber = decryptPayoutField(
          payoutAccount.mobileMoneyNumberEncryptedJson as unknown as {
            encryptedValue: string;
            iv: string;
            authTag: string;
          },
        );
      } else {
        throw new UnprocessableEntityException('Payout account is missing destination details');
      }

      let recipientId = payoutAccount.providerRecipientId;
      if (!recipientId) {
        const country = payoutAccount.country.toUpperCase() as RecipientCountry;
        let name: { firstName: string; lastName: string };
        if (payoutAccount.type === 'BANK' && payoutAccount.accountName) {
          name = splitFullName(payoutAccount.accountName);
        } else {
          const owner = await this.prisma.user.findUniqueOrThrow({
            where: { id: payoutAccount.userId },
            select: { firstName: true, lastName: true },
          });
          name = { firstName: owner.firstName ?? 'Trainer', lastName: owner.lastName ?? 'Account' };
        }
        const created = await this.flutterwaveV4.createRecipient(
          payoutAccount.type === 'BANK'
            ? {
                type: 'bank',
                country,
                bankCode: payoutAccount.bankCode!,
                accountNumber: accountNumber!,
                ...name,
              }
            : {
                type: 'mobile_money',
                country,
                network: payoutAccount.mobileMoneyNetwork!,
                phoneNumber: accountNumber!,
                ...name,
              },
        );
        recipientId = created.recipientId;
        await this.prisma.payoutAccount.update({
          where: { id: payoutAccount.id },
          data: { providerRecipientId: recipientId },
        });
      }

      let senderId = await this.platformSettings.getFlutterwaveV4SenderId();
      if (!senderId) {
        const created = await this.flutterwaveV4.createSender();
        senderId = created.senderId;
        await this.prisma.platformSettings.update({
          where: { id: 'default' },
          data: { flutterwaveV4SenderId: senderId },
        });
      }

      if (!withdrawal.fiatAmount && !withdrawal.destinationCountry) {
        throw new UnprocessableEntityException(
          'Withdrawal is missing its payout country and cannot be converted to fiat',
        );
      }
      const fiatConversion = withdrawal.fiatAmount
        ? { fiatAmount: withdrawal.fiatAmount, fiatUsdExchangeRate: withdrawal.fiatUsdExchangeRate }
        : await this.getFiatWithdrawalConversion(
            withdrawal.destinationCountry!,
            withdrawal.destinationCurrency,
            withdrawal.usdtAmount,
          );

      const transfer = await this.flutterwaveV4.createTransfer({
        recipientId,
        senderId,
        amount: fiatConversion.fiatAmount.toNumber(),
        currency: withdrawal.destinationCurrency,
        reference: withdrawal.id,
        narration: `Dialect Library trainer payout: ${withdrawal.id}`,
      });

      await this.prisma.$transaction([
        this.prisma.withdrawalRequest.update({
          where: { id },
          data: {
            status: this.mapFlutterwaveV4TransferStatus(transfer.status),
            provider: 'flutterwave-v4',
            providerPayoutId: transfer.transferId,
            providerStatus: transfer.status ?? 'created',
            providerPayload: transfer.raw as Prisma.InputJsonValue,
            providerError: null,
            ...(withdrawal.fiatAmount ? {} : fiatConversion),
            submittedToProviderAt: new Date(),
            providerSettledAt:
              this.mapFlutterwaveV4TransferStatus(transfer.status) === WithdrawalStatus.PAID
                ? new Date()
                : null,
            resolvedAt:
              this.mapFlutterwaveV4TransferStatus(transfer.status) === WithdrawalStatus.PAID
                ? new Date()
                : null,
            adminNote: body.adminNote,
          },
        }),
        this.prisma.flutterwaveV4TransferEvent.create({
          data: {
            eventHash: randomUUID(),
            withdrawalRequestId: id,
            transferId: transfer.transferId,
            reference: withdrawal.id,
            eventType: 'create',
            providerStatus: transfer.status,
            payload: transfer.raw as Prisma.InputJsonValue,
          },
        }),
      ]);
      this.logger.log(
        `Withdrawal submitted to Flutterwave v4: admin=${req.user.sub} withdrawal=${id} providerPayoutId=${transfer.transferId}`,
      );

      return {
        withdrawalId: id,
        status: this.mapFlutterwaveV4TransferStatus(transfer.status),
        providerPayoutId: transfer.transferId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.FAILED,
          provider: 'flutterwave-v4',
          providerError: message,
          adminNote: body.adminNote,
        },
      });
      await this.prisma.flutterwaveV4TransferEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: id,
          reference: withdrawal.id,
          eventType: 'create_failed',
          payload: { message },
          processingError: message,
        },
      });
      this.logger.error(
        `Withdrawal submit-to-Flutterwave-v4 failed: admin=${req.user.sub} withdrawal=${id}: ${message}`,
      );
      throw err;
    }
  }

  @Post('admin/withdrawals/:id/refresh-flutterwave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async refreshFlutterwaveWithdrawalStatus(@Param('id') id: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (!withdrawal.providerPayoutId) {
      throw new UnprocessableEntityException('Withdrawal has not been submitted to Flutterwave');
    }

    // A withdrawal submitted under v4 must always be refreshed via v4, even
    // if isFlutterwaveV4Enabled is later toggled off -- its own stored
    // provider tag decides the rail, not the current setting.
    if (withdrawal.provider === 'flutterwave-v4') {
      const result = await this.flutterwaveV4.getTransferStatus(withdrawal.providerPayoutId);
      await this.recordFlutterwaveV4PayoutStatus(
        id,
        result.transferId,
        'status',
        result.status,
        result.raw,
      );
      return {
        withdrawalId: id,
        status: this.mapFlutterwaveV4TransferStatus(result.status),
        providerPayoutId: result.transferId,
      };
    }

    const result = await this.flutterwave.getTransferStatus(withdrawal.providerPayoutId);
    await this.recordFlutterwavePayoutStatus(
      id,
      result.transferId,
      'status',
      result.status,
      result.raw,
    );
    return {
      withdrawalId: id,
      status: this.mapFlutterwaveTransferStatus(result.status),
      providerPayoutId: result.transferId,
    };
  }

  /**
   * Thin proxy over FlutterwaveService.listBanks -- any authenticated
   * trainer can look up bank codes for the "add payout account" form
   * without needing Flutterwave's secret key client-side.
   */
  @Get('banks/:country')
  @UseGuards(JwtAuthGuard)
  async listBanks(@Param('country') country: string) {
    return this.flutterwave.listBanks(country);
  }

  @Post('admin/withdrawals/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resolveWithdrawal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ResolveWithdrawalDto,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    const resolvableStatuses: WithdrawalStatus[] = [
      WithdrawalStatus.PENDING,
      WithdrawalStatus.APPROVED,
      WithdrawalStatus.FAILED,
    ];
    if (!resolvableStatuses.includes(withdrawal.status)) {
      throw new UnprocessableEntityException('Withdrawal request already resolved');
    }
    if (body.outcome === 'paid' && withdrawal.status === WithdrawalStatus.FAILED) {
      throw new UnprocessableEntityException(
        'A failed payout must be reconciled (check provider status) before marking paid manually -- reject/refund instead if the payout truly never went through',
      );
    }

    // Only the money-moving outcome ("paid") is gated -- rejecting reverses
    // nothing an admin hasn't already implicitly authorized by declining.
    if (body.outcome === 'paid' && (await this.platformSettings.isAdminPayoutOtpEnabled())) {
      if (!body.otpRequestId || !body.code) {
        throw new UnprocessableEntityException(
          'OTP verification is required to mark this withdrawal paid',
        );
      }
      await this.otp.verify({
        otpRequestId: body.otpRequestId,
        userId: req.user.sub,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code: body.code,
        contextHash: adminActionContextHash({
          action: 'withdrawal',
          id,
          tokenAmount: withdrawal.tokenAmount.toNumber(),
          destinationCurrency: withdrawal.destinationCurrency,
          destinationAddress: withdrawal.destinationAddress,
          destinationNetwork: withdrawal.destinationNetwork,
        }),
      });
    }

    if (body.outcome === 'paid') {
      await this.prisma.withdrawalRequest.update({
        where: { id },
        data: { status: WithdrawalStatus.PAID, resolvedAt: new Date(), adminNote: body.adminNote },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.withdrawalRequest.update({
          where: { id },
          data: {
            status: WithdrawalStatus.REJECTED,
            resolvedAt: new Date(),
            adminNote: body.adminNote,
          },
        }),
        this.prisma.ledgerEntry.create({
          data: {
            walletId: withdrawal.walletId,
            type: 'WITHDRAWAL_REVERSED',
            amount: withdrawal.tokenAmount,
            reference: withdrawal.id,
          },
        }),
        this.prisma.wallet.update({
          where: { id: withdrawal.walletId },
          data: { balance: { increment: withdrawal.tokenAmount } },
        }),
      ]);
    }

    this.logger.log(
      `Withdrawal resolved: admin=${req.user.sub} withdrawal=${id} outcome=${body.outcome}`,
    );
    return { withdrawalId: id, status: body.outcome === 'paid' ? 'paid' : 'rejected' };
  }

  private async verifyAdminPayoutOtpIfEnabled(
    adminUserId: string,
    withdrawal: {
      id: string;
      tokenAmount: Prisma.Decimal;
      destinationCurrency: string;
      destinationAddress: string;
      destinationNetwork: string;
    },
    otpRequestId?: string,
    code?: string,
  ): Promise<void> {
    if (!(await this.platformSettings.isAdminPayoutOtpEnabled())) return;
    if (!otpRequestId || !code) {
      throw new UnprocessableEntityException(
        'OTP verification is required to submit this withdrawal payout',
      );
    }
    await this.otp.verify({
      otpRequestId,
      userId: adminUserId,
      purpose: OtpPurpose.ADMIN_PAYOUT,
      code,
      contextHash: adminActionContextHash({
        action: 'withdrawal',
        id: withdrawal.id,
        tokenAmount: withdrawal.tokenAmount.toNumber(),
        destinationCurrency: withdrawal.destinationCurrency,
        destinationAddress: withdrawal.destinationAddress,
        destinationNetwork: withdrawal.destinationNetwork,
      }),
    });
  }

  private mapProviderPayoutStatus(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && NOWPAYMENTS_PAYOUT_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && NOWPAYMENTS_PAYOUT_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  private isProviderPayoutFinished(status: string | null | undefined): boolean {
    const normalized = status?.toLowerCase();
    return Boolean(normalized && NOWPAYMENTS_PAYOUT_FINISHED_STATUSES.has(normalized));
  }

  private async recordNowPaymentsPayoutStatus(
    withdrawalId: string,
    providerPayoutId: string,
    eventType: string,
    providerStatus: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const status = this.mapProviderPayoutStatus(providerStatus);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status,
          provider: 'nowpayments',
          providerPayoutId,
          providerStatus: providerStatus ?? undefined,
          providerPayload: payload as Prisma.InputJsonValue,
          providerError: null,
          providerSettledAt: status === WithdrawalStatus.PAID ? now : undefined,
          resolvedAt: status === WithdrawalStatus.PAID ? now : undefined,
        },
      }),
      this.prisma.nowPaymentsPayoutEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: withdrawalId,
          providerPayoutId,
          eventType,
          providerStatus,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private mapFlutterwaveTransferStatus(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && FLUTTERWAVE_TRANSFER_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && FLUTTERWAVE_TRANSFER_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  private isFlutterwaveTransferFinished(status: string | null | undefined): boolean {
    const normalized = status?.toLowerCase();
    return Boolean(normalized && FLUTTERWAVE_TRANSFER_FINISHED_STATUSES.has(normalized));
  }

  private mapFlutterwaveV4TransferStatus(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && FLUTTERWAVE_V4_TRANSFER_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && FLUTTERWAVE_V4_TRANSFER_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  /** v4 counterpart to recordFlutterwavePayoutStatus -- writes provider: 'flutterwave-v4' and the separate FlutterwaveV4TransferEvent table, used by the webhook handler, the manual refresh endpoint, and runFlutterwaveV4's reconciliation poll. */
  private async recordFlutterwaveV4PayoutStatus(
    withdrawalId: string,
    transferId: string,
    eventType: string,
    providerStatus: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const status = this.mapFlutterwaveV4TransferStatus(providerStatus);
    const now = new Date();
    // Same reserve-debit-on-first-PAID as recordFlutterwavePayoutStatus --
    // v4 payouts draw against the same currency-keyed ReserveAccount as v3
    // (and as v4 funding credits), since the reserve ledger is provider-
    // scoped ("flutterwave"), not rail-version-scoped.
    const reserveDebitOps =
      status === WithdrawalStatus.PAID
        ? (
            await debitReserveForFlutterwavePayoutOps(this.prisma, {
              withdrawalId,
              providerPayoutId: transferId,
              ...(await this.getFiatWithdrawalReserveAmounts(withdrawalId)),
            })
          ).ops
        : [];
    await this.prisma.$transaction([
      this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status,
          provider: 'flutterwave-v4',
          providerPayoutId: transferId,
          providerStatus: providerStatus ?? undefined,
          providerPayload: payload as Prisma.InputJsonValue,
          providerError: null,
          providerSettledAt: status === WithdrawalStatus.PAID ? now : undefined,
          resolvedAt: status === WithdrawalStatus.PAID ? now : undefined,
        },
      }),
      this.prisma.flutterwaveV4TransferEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: withdrawalId,
          transferId,
          eventType,
          providerStatus,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
      ...reserveDebitOps,
    ]);
  }

  private async recordFlutterwavePayoutStatus(
    withdrawalId: string,
    providerPayoutId: string,
    eventType: string,
    providerStatus: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const status = this.mapFlutterwaveTransferStatus(providerStatus);
    const now = new Date();
    // Debits the Tokenomics reserve ledger the moment this transfer first
    // reaches PAID -- the missing counterpart to the reserve credit that
    // already happens on confirmed Flutterwave funding (see
    // TokenomicsService.recordConfirmedFlutterwaveDepositTx). Only fetched
    // when actually needed; idempotent on withdrawalId so a later
    // reconciliation poll that re-observes PAID on an already-debited
    // withdrawal is a safe no-op.
    const reserveDebitOps =
      status === WithdrawalStatus.PAID
        ? (
            await debitReserveForFlutterwavePayoutOps(this.prisma, {
              withdrawalId,
              providerPayoutId,
              ...(await this.getFiatWithdrawalReserveAmounts(withdrawalId)),
            })
          ).ops
        : [];
    await this.prisma.$transaction([
      this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status,
          provider: 'flutterwave',
          providerPayoutId,
          providerStatus: providerStatus ?? undefined,
          providerPayload: payload as Prisma.InputJsonValue,
          providerError: null,
          providerSettledAt: status === WithdrawalStatus.PAID ? now : undefined,
          resolvedAt: status === WithdrawalStatus.PAID ? now : undefined,
        },
      }),
      this.prisma.flutterwavePayoutEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: withdrawalId,
          providerPayoutId,
          eventType,
          providerStatus,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
      ...reserveDebitOps,
    ]);
  }

  /** Shared by recordFlutterwavePayoutStatus/recordFlutterwaveV4PayoutStatus -- both rails share the same WithdrawalRequest fiat snapshot fields. */
  private async getFiatWithdrawalReserveAmounts(withdrawalId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: withdrawalId },
      select: { destinationCurrency: true, fiatAmount: true, usdtAmount: true },
    });
    return {
      currency: withdrawal.destinationCurrency,
      // .toString() rather than passing the Decimal-like value through
      // as-is -- debitReserveForFlutterwavePayoutOps re-wraps this in its
      // own `new Prisma.Decimal(...)`, which (unlike Decimal-to-Decimal
      // arithmetic) only accepts a genuine Decimal/number/string, not an
      // arbitrary object that merely has toString/toNumber methods.
      fiatAmount: (withdrawal.fiatAmount ?? new Prisma.Decimal(0)).toString(),
      usdAmount: withdrawal.usdtAmount.toString(),
    };
  }

  /**
   * Admin dashboard summary cards: counts/sums that have no other single
   * endpoint. Deposit/referral-bonus totals only include confirmed
   * deposits and credited training payouts so the dashboard can't overstate
   * revenue from pending/expired invoices.
   */
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminStats() {
    const [
      totalUsers,
      totalTrainers,
      totalAdmins,
      activeUsers,
      suspendedUsers,
      verifiedUsers,
      referralSettings,
      pendingWithdrawals,
      pendingWithdrawalAgg,
      dataAccessLeads,
      countriesCount,
      dialectsCount,
      wordsCount,
      wordTranslationsCount,
      promptsCount,
      activePromptsCount,
      promptTranslationsCount,
      trainingSessionsCount,
      wordRecordingsCount,
      wordRecordingsPending,
      wordRecordingsScored,
      wordRecordingsSettled,
      submissionsCount,
      submissionsPending,
      submissionsTranscribed,
      submissionsScored,
      submissionsSettled,
      submissionsRejected,
      walletsCount,
      walletAgg,
      depositAgg,
      pendingDeposits,
      confirmedDeposits,
      ipnEventsCount,
      referralBonusAgg,
      trainingPayoutAgg,
      withdrawalPaidAgg,
      subscriptionPoolsCount,
      activeSubscriptionPools,
      subscriptionPoolAgg,
      settledSubmissionPayoutAgg,
      settledWordRecordingPayoutAgg,
      tokenUsdRate,
      blogPostsCount,
      publishedBlogPostsCount,
      draftBlogPostsCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.TRAINER } }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { emailVerified: { not: null } } }),
      this.getReferralSettings(),
      this.prisma.withdrawalRequest.count({ where: { status: WithdrawalStatus.PENDING } }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: WithdrawalStatus.PENDING },
        _sum: { tokenAmount: true, usdtAmount: true },
      }),
      this.prisma.dataAccessLead.count(),
      this.prisma.country.count(),
      this.prisma.dialect.count(),
      this.prisma.word.count(),
      this.prisma.wordTranslation.count(),
      this.prisma.prompt.count(),
      this.prisma.prompt.count({ where: { active: true } }),
      this.prisma.promptTranslation.count(),
      this.prisma.trainingSession.count(),
      this.prisma.wordRecording.count(),
      this.prisma.wordRecording.count({ where: { status: SubmissionStatus.PENDING } }),
      this.prisma.wordRecording.count({ where: { status: SubmissionStatus.SCORED } }),
      this.prisma.wordRecording.count({ where: { status: SubmissionStatus.SETTLED } }),
      this.prisma.submission.count(),
      this.prisma.submission.count({ where: { status: SubmissionStatus.PENDING } }),
      this.prisma.submission.count({ where: { status: SubmissionStatus.TRANSCRIBED } }),
      this.prisma.submission.count({ where: { status: SubmissionStatus.SCORED } }),
      this.prisma.submission.count({ where: { status: SubmissionStatus.SETTLED } }),
      this.prisma.submission.count({ where: { status: SubmissionStatus.REJECTED } }),
      this.prisma.wallet.count(),
      this.prisma.wallet.aggregate({ _sum: { balance: true, lockedBalance: true } }),
      this.prisma.deposit.aggregate({
        where: { status: 'confirmed' },
        _sum: { usdAmount: true, tokenAmount: true },
      }),
      this.prisma.deposit.count({ where: { status: 'pending' } }),
      this.prisma.deposit.count({ where: { status: 'confirmed' } }),
      this.prisma.nowPaymentsIpnEvent.count(),
      this.prisma.ledgerEntry.aggregate({
        where: {
          type: {
            in: [
              LedgerEntryType.REFERRAL_COMMISSION,
              LedgerEntryType.REFERRAL_FUNDING_BONUS,
              LedgerEntryType.REFERRAL_PAYOUT_BONUS,
            ],
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { type: LedgerEntryType.TRAINING_PAYOUT },
        _sum: { amount: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: WithdrawalStatus.PAID },
        _sum: { tokenAmount: true, usdtAmount: true },
      }),
      this.prisma.subscriptionPool.count(),
      this.prisma.subscriptionPool.count({ where: { status: SubscriptionPoolStatus.ACTIVE } }),
      this.prisma.subscriptionPool.aggregate({
        where: { status: SubscriptionPoolStatus.ACTIVE },
        _sum: { usdAmount: true },
      }),
      this.prisma.submission.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.prisma.wordRecording.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.getCurrentTokenUsdRate(),
      this.prisma.blogPost.count(),
      this.prisma.blogPost.count({ where: { status: BlogPostStatus.PUBLISHED } }),
      this.prisma.blogPost.count({ where: { status: BlogPostStatus.DRAFT } }),
    ]);

    return {
      totalUsers,
      totalTrainers,
      totalAdmins,
      activeUsers,
      suspendedUsers,
      verifiedUsers,
      referralSettings: {
        fundingBonusRate: referralSettings.fundingBonusRate.toString(),
        fundingBonusEnabled: referralSettings.fundingBonusEnabled,
        payoutBonusRate: referralSettings.payoutBonusRate.toString(),
        payoutBonusEnabled: referralSettings.payoutBonusEnabled,
      },
      pendingWithdrawals,
      pendingWithdrawalTokens: pendingWithdrawalAgg._sum.tokenAmount?.toString() ?? '0',
      pendingWithdrawalUsdt: pendingWithdrawalAgg._sum.usdtAmount?.toString() ?? '0',
      dataAccessLeads,
      countriesCount,
      dialectsCount,
      wordsCount,
      wordTranslationsCount,
      promptsCount,
      activePromptsCount,
      promptTranslationsCount,
      trainingSessionsCount,
      wordRecordingsCount,
      wordRecordingsPending,
      wordRecordingsScored,
      wordRecordingsSettled,
      submissionsCount,
      submissionsPending,
      submissionsTranscribed,
      submissionsScored,
      submissionsSettled,
      submissionsRejected,
      walletsCount,
      totalWalletBalance: walletAgg._sum.balance?.toString() ?? '0',
      totalLockedTokens: walletAgg._sum.lockedBalance?.toString() ?? '0',
      totalDepositsUsd: depositAgg._sum.usdAmount?.toString() ?? '0',
      totalTokensFunded: depositAgg._sum.tokenAmount?.toString() ?? '0',
      pendingDeposits,
      confirmedDeposits,
      ipnEventsCount,
      totalReferralBonuses: referralBonusAgg._sum.amount?.toString() ?? '0',
      totalTrainingPayouts: trainingPayoutAgg._sum.amount?.toString() ?? '0',
      totalWithdrawnTokens: withdrawalPaidAgg._sum.tokenAmount?.toString() ?? '0',
      totalWithdrawnUsdt: withdrawalPaidAgg._sum.usdtAmount?.toString() ?? '0',
      subscriptionPoolsCount,
      activeSubscriptionPools,
      activeSubscriptionPoolUsd: subscriptionPoolAgg._sum.usdAmount?.toString() ?? '0',
      // Reward Pool available: SUM(active SubscriptionPool.usdAmount) converted to
      // tokens via getTokenUsdRate, minus tokens already settled -- same formula
      // settlement-job's getRewardPoolAvailableTokens uses (informational only,
      // never gates a payout; see computeTrainingPayout's no-loss guarantee).
      // Can legitimately go negative -- that's the signal more pools need opening.
      rewardPoolAvailableTokens: new Prisma.Decimal(subscriptionPoolAgg._sum.usdAmount ?? 0)
        .div(tokenUsdRate)
        .sub(settledSubmissionPayoutAgg._sum.payoutTokenAmount ?? 0)
        .sub(settledWordRecordingPayoutAgg._sum.payoutTokenAmount ?? 0)
        .toString(),
      blogPostsCount,
      publishedBlogPostsCount,
      draftBlogPostsCount,
    };
  }

  @Get('admin/leaderboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminLeaderboard() {
    const [topEarners, topContributors] = await Promise.all([
      this.buildEarnersRanking(10),
      this.buildContributorsRanking(10),
    ]);
    return { topEarners: topEarners.rows, topContributors: topContributors.rows };
  }

  /**
   * Full paginated earners leaderboard behind a dedicated admin page/route
   * (frontend/app/admin/leaderboard) -- same ranking as admin/leaderboard's
   * topEarners, just not capped at 10. See LEADERBOARD_MAX_ROWS's comment on
   * buildEarnersRanking for why "paginated" here means "paginated within a
   * bounded top-N", not a true full-table scan.
   */
  @Get('admin/leaderboard/earners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminLeaderboardEarners(@Query() query: ListLeaderboardDto) {
    const { rows, total } = await this.buildEarnersRanking(LEADERBOARD_MAX_ROWS);
    return paginateInMemory(rows, query.page, query.pageSize, total);
  }

  /** Full paginated contributors leaderboard -- see getAdminLeaderboardEarners. */
  @Get('admin/leaderboard/contributors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminLeaderboardContributors(@Query() query: ListLeaderboardDto) {
    const { rows, total } = await this.buildContributorsRanking(LEADERBOARD_MAX_ROWS);
    return paginateInMemory(rows, query.page, query.pageSize, total);
  }

  /**
   * Sorted/limited by Postgres, not in JS -- groupBy supports orderBy on the
   * same aggregate it computes, so this stays a single indexed scan even
   * once ledger_entries has millions of rows, unlike pulling every wallet's
   * total into memory just to rank them. `limit` bounds how many top rows
   * are ranked at all (10 for the dashboard overview cards,
   * LEADERBOARD_MAX_ROWS for the dedicated paginated page) -- a leaderboard
   * is inherently "top N", so this trades an exact full-table total for a
   * fast, honestly-bounded one instead of a second expensive distinct-count
   * query nobody browsing a leaderboard needs past the first few pages.
   */
  private async buildEarnersRanking(limit: number) {
    const sortedEarners = await this.prisma.ledgerEntry.groupBy({
      by: ['walletId'],
      where: { type: LedgerEntryType.TRAINING_PAYOUT, amount: { gt: 0 } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    });

    const earnerWallets = await this.prisma.wallet.findMany({
      where: { id: { in: sortedEarners.map((entry) => entry.walletId) } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      },
    });
    const walletById = new Map(earnerWallets.map((wallet) => [wallet.id, wallet]));

    const rows = sortedEarners.flatMap((entry) => {
      const wallet = walletById.get(entry.walletId);
      if (!wallet) return [];
      return [
        {
          user: wallet.user,
          totalEarned: entry._sum.amount?.toString() ?? '0',
          payoutCount: entry._count._all,
        },
      ];
    });
    return { rows, total: rows.length };
  }

  /** Same bounded-ranking shape as buildEarnersRanking, ranked by word recordings + submissions instead of DL earned. */
  private async buildContributorsRanking(limit: number) {
    const [wordContributorTotals, submissionContributorTotals] = await Promise.all([
      this.prisma.wordRecording.groupBy({ by: ['userId'], _count: { _all: true } }),
      this.prisma.submission.groupBy({ by: ['userId'], _count: { _all: true } }),
    ]);

    const contributorCounts = new Map<string, { wordRecordings: number; submissions: number }>();
    for (const entry of wordContributorTotals) {
      if (!entry.userId) continue;
      contributorCounts.set(entry.userId, {
        wordRecordings: entry._count._all,
        submissions: contributorCounts.get(entry.userId)?.submissions ?? 0,
      });
    }
    for (const entry of submissionContributorTotals) {
      if (!entry.userId) continue;
      contributorCounts.set(entry.userId, {
        wordRecordings: contributorCounts.get(entry.userId)?.wordRecordings ?? 0,
        submissions: entry._count._all,
      });
    }

    const sortedContributorIds = [...contributorCounts.entries()]
      .sort(([, a], [, b]) => b.wordRecordings + b.submissions - (a.wordRecordings + a.submissions))
      .slice(0, limit)
      .map(([userId]) => userId);

    const contributorUsers = await this.prisma.user.findMany({
      where: { id: { in: sortedContributorIds } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    const userById = new Map(contributorUsers.map((user) => [user.id, user]));

    const rows = sortedContributorIds.flatMap((userId) => {
      const user = userById.get(userId);
      const counts = contributorCounts.get(userId);
      if (!user || !counts) return [];
      return [
        {
          user,
          totalTasks: counts.wordRecordings + counts.submissions,
          wordRecordings: counts.wordRecordings,
          submissions: counts.submissions,
        },
      ];
    });
    return { rows, total: rows.length };
  }

  // --- Referral settings / payouts (admin) ---------------------------------

  @Get('admin/referral-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getReferralSettingsForAdmin() {
    const settings = await this.getReferralSettings();
    return {
      id: settings.id,
      fundingBonusRate: settings.fundingBonusRate.toString(),
      fundingBonusEnabled: settings.fundingBonusEnabled,
      payoutBonusRate: settings.payoutBonusRate.toString(),
      payoutBonusEnabled: settings.payoutBonusEnabled,
      updatedAt: settings.updatedAt,
      createdAt: settings.createdAt,
    };
  }

  @Patch('admin/referral-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateReferralSettings(@Body() body: UpdateReferralSettingsDto) {
    const settings = await this.prisma.referralSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        fundingBonusRate: body.fundingBonusRate,
        fundingBonusEnabled: body.fundingBonusEnabled,
        payoutBonusRate: body.payoutBonusRate,
        payoutBonusEnabled: body.payoutBonusEnabled,
      },
      update: {
        fundingBonusRate: body.fundingBonusRate,
        fundingBonusEnabled: body.fundingBonusEnabled,
        payoutBonusRate: body.payoutBonusRate,
        payoutBonusEnabled: body.payoutBonusEnabled,
      },
    });
    return {
      id: settings.id,
      fundingBonusRate: settings.fundingBonusRate.toString(),
      fundingBonusEnabled: settings.fundingBonusEnabled,
      payoutBonusRate: settings.payoutBonusRate.toString(),
      payoutBonusEnabled: settings.payoutBonusEnabled,
      updatedAt: settings.updatedAt,
      createdAt: settings.createdAt,
    };
  }

  @Post('admin/training-payouts/otp')
  @UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async requestTrainingPayoutOtp(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateTrainingPayoutDto,
  ) {
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const contextHash = adminActionContextHash({
      action: 'training-payout',
      userId: body.userId,
      tokenAmount: body.tokenAmount,
      reference: body.reference,
    });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  @Post('admin/training-payouts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createTrainingPayout(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateTrainingPayoutDto,
  ) {
    if (await this.platformSettings.isAdminPayoutOtpEnabled()) {
      if (!body.otpRequestId || !body.code) {
        throw new UnprocessableEntityException('OTP verification is required to issue this payout');
      }
      await this.otp.verify({
        otpRequestId: body.otpRequestId,
        userId: req.user.sub,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code: body.code,
        contextHash: adminActionContextHash({
          action: 'training-payout',
          userId: body.userId,
          tokenAmount: body.tokenAmount,
          reference: body.reference,
        }),
      });
    }

    const result = await creditAdminFunding(
      this.prisma,
      body.userId,
      body.tokenAmount,
      body.reference,
    );

    // Best-effort -- the credit has already landed, so a failed/slow email
    // must never fail this endpoint or roll back the credit. Fire-and-log
    // rather than await-and-throw, same treatment as any other
    // notification that isn't part of the transaction it's about.
    void this.prisma.user
      .findUnique({ where: { id: body.userId }, select: { email: true } })
      .then(
        (trainer) =>
          trainer &&
          this.mail.sendTrainingPayoutCreditedEmail({
            trainerEmail: trainer.email,
            tokenAmount: result.amount,
            reference: body.reference,
          }),
      )
      .catch((err) =>
        this.logger.error(
          `Failed to send admin-funding email for user=${body.userId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return result;
  }

  @Post('admin/wallet-adjustments/otp')
  @UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async requestAdminWalletAdjustmentOtp(
    @Req() req: AuthenticatedRequest,
    @Body() body: AdminWalletAdjustmentDto,
  ) {
    if (body.tokenAmount >= 0) {
      throw new UnprocessableEntityException('Debit amount must be negative');
    }
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const contextHash = adminActionContextHash({
      action: 'admin-wallet-adjustment',
      userId: body.userId,
      tokenAmount: body.tokenAmount,
      reference: body.reference,
    });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  @Post('admin/wallet-adjustments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createAdminWalletAdjustment(
    @Req() req: AuthenticatedRequest,
    @Body() body: AdminWalletAdjustmentDto,
  ) {
    if (body.tokenAmount >= 0) {
      throw new UnprocessableEntityException('Debit amount must be negative');
    }
    if (await this.platformSettings.isAdminPayoutOtpEnabled()) {
      if (!body.otpRequestId || !body.code) {
        throw new UnprocessableEntityException(
          'OTP verification is required to adjust this wallet',
        );
      }
      await this.otp.verify({
        otpRequestId: body.otpRequestId,
        userId: req.user.sub,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code: body.code,
        contextHash: adminActionContextHash({
          action: 'admin-wallet-adjustment',
          userId: body.userId,
          tokenAmount: body.tokenAmount,
          reference: body.reference,
        }),
      });
    }

    try {
      const result = await adjustAdminWallet(
        this.prisma,
        body.userId,
        body.tokenAmount,
        body.reference,
      );
      this.logger.log(
        `Admin wallet adjusted: admin=${req.user.sub} user=${body.userId} amount=${result.amount}`,
      );
      return result;
    } catch (err) {
      if (err instanceof Error && err.message === 'Insufficient wallet balance for this debit') {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }

  /**
   * Referrers + how much they've earned so far, for admins to see who's
   * actually bringing in real contributors. groupBy on referral bonus ledger
   * entries, joined back to the referrer's wallet for the referrer's email.
   */
  @Get('admin/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listReferrals() {
    const totals = await this.prisma.ledgerEntry.groupBy({
      by: ['walletId'],
      where: {
        type: { in: ['REFERRAL_COMMISSION', 'REFERRAL_FUNDING_BONUS', 'REFERRAL_PAYOUT_BONUS'] },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const walletIds = totals.map((t) => t.walletId);
    const wallets = await this.prisma.wallet.findMany({
      where: { id: { in: walletIds } },
      include: {
        user: {
          select: {
            email: true,
            referralCode: true,
            referrals: { select: { id: true, email: true, createdAt: true } },
          },
        },
      },
    });
    const walletById = new Map(wallets.map((w) => [w.id, w]));

    return totals.map((t) => {
      const wallet = walletById.get(t.walletId);
      return {
        referrerEmail: wallet?.user.email ?? null,
        referralCode: wallet?.user.referralCode ?? null,
        referredUsers: wallet?.user.referrals ?? [],
        totalCommission: t._sum.amount?.toString() ?? '0',
        bonusEventCount: t._count._all,
      };
    });
  }
}

/** Flutterwave v4 recipients want name.first/name.last; PayoutAccount.accountName is one combined string (from v3's resolveAccount) -- best-effort split on the first space, last word(s) as the surname. */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function flwString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function ipnString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function ipnNumber(value: unknown): number | undefined {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function localDepositStatus(paymentStatus: string): string | undefined {
  if (['waiting', 'confirming', 'confirmed', 'sending'].includes(paymentStatus)) {
    return 'pending';
  }
  if (paymentStatus === 'partially_paid') {
    return 'partially_paid';
  }
  if (['failed', 'expired', 'refunded'].includes(paymentStatus)) {
    return paymentStatus;
  }
  return undefined;
}

function validateFinishedPayment(
  body: Record<string, unknown>,
  expectedInvoiceId: string,
  expectedUsdAmount: string,
): string | undefined {
  if (!ipnString(body.payment_id)) {
    return 'Missing payment_id';
  }

  const invoiceId = ipnString(body.invoice_id);
  if (invoiceId && invoiceId !== expectedInvoiceId) {
    return 'Invoice ID does not match deposit';
  }

  if (ipnString(body.price_currency)?.toLowerCase() !== 'usd') {
    return 'Payment price currency is not USD';
  }

  const priceAmount = ipnNumber(body.price_amount);
  if (priceAmount === undefined || Math.abs(priceAmount - Number(expectedUsdAmount)) > 0.00000001) {
    return 'Payment price amount does not match deposit';
  }

  return undefined;
}
