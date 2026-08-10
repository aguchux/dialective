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
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LedgerEntryType, Prisma, Role, WithdrawalStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { NowPaymentsService } from './nowpayments.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ResolveWithdrawalDto } from './dto/resolve-withdrawal.dto';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { CreateTrainingPayoutDto } from './dto/create-training-payout.dto';
import { ListEarningsDto } from './dto/list-earnings.dto';
import { tokensToUsdt, usdToTokens } from './token-rate.util';

const EARNING_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.TRAINING_PAYOUT,
  LedgerEntryType.REFERRAL_COMMISSION,
  LedgerEntryType.REFERRAL_FUNDING_BONUS,
  LedgerEntryType.REFERRAL_PAYOUT_BONUS,
];

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
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  private async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.prisma.wallet.create({ data: { userId } });
  }

  private async getReferralSettings() {
    return this.prisma.referralSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: AuthenticatedRequest) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    return { balance: wallet.balance.toString(), tokenUsdRate: await this.platformSettings.getTokenUsdRate() };
  }

  @Get('wallet/dashboard')
  @UseGuards(JwtAuthGuard)
  async getTrainerDashboard(@Req() req: AuthenticatedRequest) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5, 1);
    sixMonthsAgo.setUTCHours(0, 0, 0, 0);

    const [user, settings, ledgerTotals, recentActivity, earningsHistory, withdrawalTotals] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: {
          referralCode: true,
          referrals: {
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: { id: true, email: true, createdAt: true },
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
          type: { in: ['TRAINING_PAYOUT', 'REFERRAL_COMMISSION', 'REFERRAL_FUNDING_BONUS', 'REFERRAL_PAYOUT_BONUS'] },
          createdAt: { gte: sixMonthsAgo },
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.withdrawalRequest.groupBy({
        by: ['status'],
        where: { walletId: wallet.id },
        _sum: { tokenAmount: true },
      }),
    ]);

    const ledgerAmount = (types: string[]) =>
      ledgerTotals
        .filter((entry) => types.includes(entry.type))
        .reduce((total, entry) => total + Number(entry._sum.amount ?? 0), 0);
    const withdrawalAmount = (status: WithdrawalStatus) =>
      Number(withdrawalTotals.find((entry) => entry.status === status)?._sum.tokenAmount ?? 0);

    const monthTotals = new Map<string, number>();
    for (let offset = 0; offset < 6; offset += 1) {
      const month = new Date(Date.UTC(sixMonthsAgo.getUTCFullYear(), sixMonthsAgo.getUTCMonth() + offset, 1));
      monthTotals.set(month.toISOString().slice(0, 7), 0);
    }
    for (const entry of earningsHistory) {
      const key = entry.createdAt.toISOString().slice(0, 7);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(entry.amount));
    }

    return {
      balance: wallet.balance.toString(),
      tokenUsdRate: await this.platformSettings.getTokenUsdRate(),
      fundedTokens: ledgerAmount(['DEPOSIT']).toString(),
      trainingEarningsTokens: ledgerAmount(['TRAINING_PAYOUT']).toString(),
      referralEarningsTokens: ledgerAmount([
        'REFERRAL_COMMISSION',
        'REFERRAL_FUNDING_BONUS',
        'REFERRAL_PAYOUT_BONUS',
      ]).toString(),
      paidOutTokens: withdrawalAmount(WithdrawalStatus.PAID).toString(),
      pendingPayoutTokens: withdrawalAmount(WithdrawalStatus.PENDING).toString(),
      recentActivity: recentActivity.map((entry) => ({ ...entry, amount: entry.amount.toString() })),
      monthlyEarnings: Array.from(monthTotals, ([month, amount]) => ({ month, amount: amount.toString() })),
      referrals: {
        code: user.referralCode,
        invitedCount: user._count.referrals,
        recentInvites: user.referrals,
        fundingBonusRate: settings.fundingBonusRate.toString(),
        fundingBonusEnabled: settings.fundingBonusEnabled,
        payoutBonusRate: settings.payoutBonusRate.toString(),
        payoutBonusEnabled: settings.payoutBonusEnabled,
      },
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

  @Post('wallet/deposits')
  @UseGuards(JwtAuthGuard)
  async createDeposit(@Req() req: AuthenticatedRequest, @Body() body: CreateDepositDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const rate = await this.platformSettings.getTokenUsdRate();
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
  async handleNowPaymentsWebhook(@Body() body: Record<string, unknown>, @Headers('x-nowpayments-sig') signature?: string) {
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

    const validationError = validateFinishedPayment(body, deposit.providerChargeId, deposit.usdAmount.toString());
    if (paymentStatus === 'finished' && validationError) {
      this.logger.error(`Rejected finished NOWPayments IPN for deposit=${deposit.id}: ${validationError}`);
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
      this.logger.log(`NOWPayments IPN status=${paymentStatus} deposit=${deposit.id} credited=false`);
      return { received: true, credited: false, status: paymentStatus };
    }

    const settings = await this.getReferralSettings();
    const referrerWallet =
      deposit.wallet.user.referredById && settings.fundingBonusEnabled && settings.fundingBonusRate.gt(0)
        ? await this.getOrCreateWallet(deposit.wallet.user.referredById)
        : null;
    const fundingBonus = referrerWallet ? deposit.tokenAmount.mul(settings.fundingBonusRate) : null;

    const credited = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.deposit.updateMany({
        where: { id: deposit.id, status: { not: 'confirmed' } },
        data: { ...depositMetadata, status: 'confirmed', confirmedAt: now },
      });

      if (claimed.count === 0) {
        await tx.nowPaymentsIpnEvent.update({ where: { id: event.id }, data: { depositId: deposit.id, processedAt: now } });
        return false;
      }

      await tx.ledgerEntry.create({
        data: { walletId: deposit.walletId, type: 'DEPOSIT', amount: deposit.tokenAmount, reference: deposit.id },
      });
      await tx.wallet.update({
        where: { id: deposit.walletId },
        data: { balance: { increment: deposit.tokenAmount } },
      });

      if (referrerWallet && fundingBonus) {
        await tx.ledgerEntry.create({
          data: {
            walletId: referrerWallet.id,
            type: 'REFERRAL_FUNDING_BONUS',
            amount: fundingBonus,
            reference: deposit.id,
          },
        });
        await tx.wallet.update({
          where: { id: referrerWallet.id },
          data: { balance: { increment: fundingBonus } },
        });
      }

      await tx.nowPaymentsIpnEvent.update({ where: { id: event.id }, data: { depositId: deposit.id, processedAt: now } });
      return true;
    });

    this.logger.log(`NOWPayments IPN status=${paymentStatus} deposit=${deposit.id} credited=${credited}`);
    return { received: true, credited, status: paymentStatus };
  }

  private async completeIpnEvent(eventId: string, processingError: string, depositId?: string) {
    await this.prisma.nowPaymentsIpnEvent.update({
      where: { id: eventId },
      data: { depositId, processedAt: new Date(), processingError },
    });
  }

  /**
   * Credits a scored training payout. If the user was referred and the
   * payout referral bonus is enabled, the bonus is deducted from the user's
   * gross payout and remitted to the referrer in the same transaction.
   *
   * This is intentionally a method on the wallet boundary so settlement or
   * scoring code can reuse it instead of reimplementing referral math.
   */
  private async creditTrainingPayout(userId: string, tokenAmount: number, reference: string) {
    const userWallet = await this.getOrCreateWallet(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const settings = await this.getReferralSettings();
    const grossAmount = tokenAmount;
    const hasPayoutBonus = user.referredById && settings.payoutBonusEnabled && settings.payoutBonusRate.gt(0);
    const payoutBonus = hasPayoutBonus ? settings.payoutBonusRate.mul(grossAmount) : null;
    const netAmount = payoutBonus ? payoutBonus.neg().add(grossAmount) : grossAmount;
    const referrerWallet = user.referredById && payoutBonus ? await this.getOrCreateWallet(user.referredById) : null;

    await this.prisma.$transaction([
      this.prisma.ledgerEntry.create({
        data: {
          walletId: userWallet.id,
          type: 'TRAINING_PAYOUT',
          amount: netAmount,
          reference,
        },
      }),
      this.prisma.wallet.update({
        where: { id: userWallet.id },
        data: { balance: { increment: netAmount } },
      }),
      ...(referrerWallet && payoutBonus
        ? [
            this.prisma.ledgerEntry.create({
              data: {
                walletId: referrerWallet.id,
                type: 'REFERRAL_PAYOUT_BONUS' as const,
                amount: payoutBonus,
                reference,
              },
            }),
            this.prisma.wallet.update({
              where: { id: referrerWallet.id },
              data: { balance: { increment: payoutBonus } },
            }),
          ]
        : []),
    ]);

    return {
      userId,
      reference,
      grossAmount: grossAmount.toString(),
      netAmount: netAmount.toString(),
      referralPayoutBonus: payoutBonus?.toString() ?? '0',
      referrerUserId: user.referredById,
    };
  }

  @Post('wallet/withdrawals')
  @UseGuards(JwtAuthGuard)
  async createWithdrawal(@Req() req: AuthenticatedRequest, @Body() body: CreateWithdrawalDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const minTokens = await this.platformSettings.getMinWithdrawalTokens();

    if (body.tokenAmount < minTokens) {
      throw new UnprocessableEntityException(`Minimum withdrawal is ${minTokens} tokens`);
    }

    const rate = await this.platformSettings.getTokenUsdRate();
    const usdtAmount = tokensToUsdt(body.tokenAmount, rate);
    const withdrawalId = randomUUID();

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
          destinationAddress: body.destinationAddress,
          status: WithdrawalStatus.PENDING,
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
    ]);

    if (debit.count === 0) {
      // Nothing was decremented -- balance was insufficient. Prisma
      // transactions don't support conditional rollback mid-array, so the
      // WithdrawalRequest/LedgerEntry writes above still happened; undo them
      // explicitly rather than leaving a phantom pending request.
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
    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { wallet: { include: { user: { select: { email: true } } } } },
    });
  }

  @Post('admin/withdrawals/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resolveWithdrawal(@Param('id') id: string, @Body() body: ResolveWithdrawalDto) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new UnprocessableEntityException('Withdrawal request already resolved');
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
          data: { status: WithdrawalStatus.REJECTED, resolvedAt: new Date(), adminNote: body.adminNote },
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

    return { withdrawalId: id, status: body.outcome === 'paid' ? 'paid' : 'rejected' };
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
    const [totalTrainers, referralSettings, pendingWithdrawals, dataAccessLeads, depositAgg, referralBonusAgg] =
      await Promise.all([
        this.prisma.user.count({ where: { role: Role.TRAINER } }),
        this.getReferralSettings(),
        this.prisma.withdrawalRequest.count({ where: { status: WithdrawalStatus.PENDING } }),
        this.prisma.dataAccessLead.count(),
        this.prisma.deposit.aggregate({ where: { status: 'confirmed' }, _sum: { usdAmount: true, tokenAmount: true } }),
        this.prisma.ledgerEntry.aggregate({
          where: { type: { in: ['REFERRAL_COMMISSION', 'REFERRAL_FUNDING_BONUS', 'REFERRAL_PAYOUT_BONUS'] } },
          _sum: { amount: true },
        }),
      ]);

    return {
      totalTrainers,
      referralSettings: {
        fundingBonusRate: referralSettings.fundingBonusRate.toString(),
        fundingBonusEnabled: referralSettings.fundingBonusEnabled,
        payoutBonusRate: referralSettings.payoutBonusRate.toString(),
        payoutBonusEnabled: referralSettings.payoutBonusEnabled,
      },
      pendingWithdrawals,
      dataAccessLeads,
      totalDepositsUsd: depositAgg._sum.usdAmount?.toString() ?? '0',
      totalTokensFunded: depositAgg._sum.tokenAmount?.toString() ?? '0',
      totalReferralBonuses: referralBonusAgg._sum.amount?.toString() ?? '0',
    };
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

  @Post('admin/training-payouts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createTrainingPayout(@Body() body: CreateTrainingPayoutDto) {
    return this.creditTrainingPayout(body.userId, body.tokenAmount, body.reference);
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
      where: { type: { in: ['REFERRAL_COMMISSION', 'REFERRAL_FUNDING_BONUS', 'REFERRAL_PAYOUT_BONUS'] } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const walletIds = totals.map((t) => t.walletId);
    const wallets = await this.prisma.wallet.findMany({
      where: { id: { in: walletIds } },
      include: { user: { select: { email: true, referralCode: true, referrals: { select: { id: true, email: true, createdAt: true } } } } },
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
