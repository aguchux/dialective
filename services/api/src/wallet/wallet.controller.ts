import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, WithdrawalStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { NowPaymentsService } from './nowpayments.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ResolveWithdrawalDto } from './dto/resolve-withdrawal.dto';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { CreateTrainingPayoutDto } from './dto/create-training-payout.dto';
import { tokensToUsdt, usdToTokens } from './token-rate.util';

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

  @Post('wallet/deposits')
  @UseGuards(JwtAuthGuard)
  async createDeposit(@Req() req: AuthenticatedRequest, @Body() body: CreateDepositDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const rate = await this.platformSettings.getTokenUsdRate();
    const tokenAmount = usdToTokens(body.usdAmount, rate);

    const deposit = await this.prisma.deposit.create({
      data: {
        walletId: wallet.id,
        providerChargeId: `pending-${randomUUID()}`, // replaced once NOWPayments returns a real invoice id
        currency: body.currency,
        usdAmount: body.usdAmount,
        tokenAmount,
        status: 'pending',
      },
    });

    const apiBaseUrl = process.env.API_PUBLIC_BASE_URL ?? 'https://api.dialectlibrary.com';
    let invoice;
    try {
      invoice = await this.nowPayments.createInvoice({
        usdAmount: body.usdAmount,
        payCurrency: body.currency,
        orderId: deposit.id,
        orderDescription: `Dialect Library token top-up: ${body.usdAmount} USD -> ${tokenAmount.toFixed(2)} tokens`,
        ipnCallbackUrl: `${apiBaseUrl}/api/v1/wallet/webhooks/nowpayments`,
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
      throw new BadRequestException('Invalid webhook signature');
    }

    const paymentStatus = body.payment_status as string | undefined;
    const depositId = body.order_id as string | undefined;

    if (paymentStatus !== 'finished' || !depositId) {
      return { received: true };
    }

    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: { wallet: { include: { user: true } } },
    });
    if (!deposit || deposit.status === 'confirmed') {
      return { received: true };
    }

    const settings = await this.getReferralSettings();
    const referrerWallet =
      deposit.wallet.user.referredById && settings.fundingBonusEnabled && settings.fundingBonusRate.gt(0)
        ? await this.getOrCreateWallet(deposit.wallet.user.referredById)
        : null;
    const fundingBonus = referrerWallet ? deposit.tokenAmount.mul(settings.fundingBonusRate) : null;

    await this.prisma.$transaction([
      this.prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: 'confirmed', confirmedAt: new Date() },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: deposit.walletId,
          type: 'DEPOSIT',
          amount: deposit.tokenAmount,
          reference: deposit.id,
        },
      }),
      this.prisma.wallet.update({
        where: { id: deposit.walletId },
        data: { balance: { increment: deposit.tokenAmount } },
      }),
      ...(referrerWallet && fundingBonus
        ? [
            this.prisma.ledgerEntry.create({
              data: {
                walletId: referrerWallet.id,
                type: 'REFERRAL_FUNDING_BONUS' as const,
                amount: fundingBonus,
                reference: deposit.id,
              },
            }),
            this.prisma.wallet.update({
              where: { id: referrerWallet.id },
              data: { balance: { increment: fundingBonus } },
            }),
          ]
        : []),
    ]);

    return { received: true };
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
