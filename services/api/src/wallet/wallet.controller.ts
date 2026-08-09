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
import { NowPaymentsService } from './nowpayments.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ResolveWithdrawalDto } from './dto/resolve-withdrawal.dto';
import { CreateReferralProgramDto } from './dto/create-referral-program.dto';
import { UpdateReferralProgramDto } from './dto/update-referral-program.dto';
import { getMinWithdrawalTokens, getTokenUsdRate, tokensToUsdt, usdToTokens } from './token-rate.util';

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
  ) {}

  private async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.prisma.wallet.create({ data: { userId } });
  }

  /**
   * "Active" = isActive AND startsAt <= now AND (endsAt IS NULL OR endsAt >
   * now). No DB constraint enforces at-most-one-active-row (see
   * schema.prisma "ReferralProgram") -- if an admin creates overlapping
   * active campaigns, the most recently created one wins here.
   */
  private async getActiveReferralProgram() {
    const now = new Date();
    return this.prisma.referralProgram.findFirst({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: AuthenticatedRequest) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    return { balance: wallet.balance.toString(), tokenUsdRate: getTokenUsdRate() };
  }

  @Post('wallet/deposits')
  @UseGuards(JwtAuthGuard)
  async createDeposit(@Req() req: AuthenticatedRequest, @Body() body: CreateDepositDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const rate = getTokenUsdRate();
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

    const apiBaseUrl = process.env.API_PUBLIC_BASE_URL ?? 'https://api.nmseprep.com';
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

    const writes = [
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
    ];

    // Referral commission: 10% (or whatever the active program's rate is)
    // of every confirmed deposit from a referred user, credited straight to
    // the referrer's wallet in the same transaction as the deposit itself
    // being confirmed -- same append-only-ledger-plus-cached-balance
    // pattern as the DEPOSIT/WITHDRAWAL writes above.
    const referredById = deposit.wallet.user.referredById;
    if (referredById) {
      const program = await this.getActiveReferralProgram();
      if (program) {
        const commission = deposit.tokenAmount.mul(program.commissionRate);
        const referrerWallet = await this.getOrCreateWallet(referredById);
        writes.push(
          this.prisma.ledgerEntry.create({
            data: {
              walletId: referrerWallet.id,
              type: 'REFERRAL_COMMISSION',
              amount: commission,
              reference: deposit.id,
            },
          }),
          this.prisma.wallet.update({
            where: { id: referrerWallet.id },
            data: { balance: { increment: commission } },
          }),
        );
      }
    }

    await this.prisma.$transaction(writes);

    return { received: true };
  }

  @Post('wallet/withdrawals')
  @UseGuards(JwtAuthGuard)
  async createWithdrawal(@Req() req: AuthenticatedRequest, @Body() body: CreateWithdrawalDto) {
    const wallet = await this.getOrCreateWallet(req.user.sub);
    const minTokens = getMinWithdrawalTokens();

    if (body.tokenAmount < minTokens) {
      throw new UnprocessableEntityException(`Minimum withdrawal is ${minTokens} tokens`);
    }

    const rate = getTokenUsdRate();
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

  // --- Referral program (admin) --------------------------------------------

  @Post('admin/referral-programs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createReferralProgram(@Body() body: CreateReferralProgramDto) {
    return this.prisma.referralProgram.create({
      data: {
        name: body.name,
        commissionRate: body.commissionRate ?? 0.1,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        isActive: body.isActive ?? true,
      },
    });
  }

  @Get('admin/referral-programs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listReferralPrograms() {
    return this.prisma.referralProgram.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Patch('admin/referral-programs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateReferralProgram(@Param('id') id: string, @Body() body: UpdateReferralProgramDto) {
    const program = await this.prisma.referralProgram.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException('Referral program not found');
    }
    return this.prisma.referralProgram.update({
      where: { id },
      data: {
        name: body.name,
        commissionRate: body.commissionRate,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        isActive: body.isActive,
      },
    });
  }

  /**
   * Referrers + how much they've earned so far, for admins to see who's
   * actually bringing in real, funding contributors. groupBy on
   * REFERRAL_COMMISSION ledger entries, joined back to the referrer's wallet
   * (walletId on those entries is always the referrer's own wallet -- see
   * handleNowPaymentsWebhook) for the referrer's email.
   */
  @Get('admin/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listReferrals() {
    const totals = await this.prisma.ledgerEntry.groupBy({
      by: ['walletId'],
      where: { type: 'REFERRAL_COMMISSION' },
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
        commissionCount: t._count._all,
      };
    });
  }
}
