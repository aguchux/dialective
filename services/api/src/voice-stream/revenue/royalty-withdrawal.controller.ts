import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsString, IsOptional, IsIn, Min } from 'class-validator';
import { OtpPurpose, Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { OtpService } from '../../otp/otp.service';
import { resolveOtpDestination } from '../../otp/otp.util';
import { royaltyWithdrawalContextHash } from '../../wallet/otp-context.util';
import { RoyaltyWithdrawalService } from './royalty-withdrawal.service';
import { UsageEstimateService } from './usage-estimate.service';

interface AuthenticatedRequest {
  user: { sub: string; role?: string };
}

class RequestRoyaltyWithdrawalOtpDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  payoutAccountId!: string;
}

class CreateRoyaltyWithdrawalDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  payoutAccountId!: string;

  @IsString()
  otpRequestId!: string;

  @IsString()
  code!: string;
}

class ResolveRoyaltyWithdrawalDto {
  @IsIn(['paid', 'rejected'])
  outcome!: 'paid' | 'rejected';

  @IsOptional()
  @IsString()
  adminNote?: string;
}

/**
 * Contributor-facing royalty balance and payouts, plus the admin resolution
 * route.
 *
 * Separate from WalletController deliberately -- these routes move a different
 * balance column with a different OTP purpose and a different minimum, and
 * folding them into a 5,000-line controller that already owns the other rail is
 * how the two come to share a code path by accident.
 */
@Controller()
export class RoyaltyWithdrawalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly otp: OtpService,
    private readonly withdrawals: RoyaltyWithdrawalService,
    private readonly usage: UsageEstimateService,
  ) {}

  /**
   * The contributor's own royalty position.
   *
   * Reports the balance and this period's usage, and deliberately no money
   * estimate: converting usage to expected DL needs a pool, a pool only exists
   * against collected revenue, and a speculative figure here would be the stale
   * promise the design warns about. `subscriberCount` is a count, never
   * identities.
   */
  @Get('royalties/me')
  @UseGuards(JwtAuthGuard)
  async myRoyalties(@Req() req: AuthenticatedRequest) {
    const [wallet, minimum, enabled, usage] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { userId: req.user.sub },
        select: { royaltyBalance: true },
      }),
      this.settings.getRoyaltyMinimumPayout(),
      this.settings.areRoyaltiesEnabled(),
      this.usage.forContributor(req.user.sub),
    ]);
    const balance = wallet?.royaltyBalance ?? null;
    return {
      enabled,
      royaltyBalance: balance?.toString() ?? '0',
      minimumPayout: minimum.toString(),
      // Whether a payout can be requested right now, so the UI does not have to
      // re-derive the rule and drift from the server's answer.
      canWithdraw: enabled && balance !== null && balance.greaterThanOrEqualTo(minimum),
      currentPeriod: {
        periodStart: usage.periodStart,
        streamCount: usage.streamCount,
        recordingsStreamed: usage.recordingsStreamed,
        subscriberCount: usage.subscriberCount,
        totalDurationMs: usage.totalDurationMs,
      },
    };
  }

  @Get('royalties/withdrawals')
  @UseGuards(JwtAuthGuard)
  async listMine(@Req() req: AuthenticatedRequest) {
    return this.withdrawals.listForUser(req.user.sub);
  }

  /**
   * Issue the step-up code.
   *
   * Validates the request first, so a code is never issued for a payout that
   * would be refused anyway -- and the contributor sees why before being asked
   * for a code.
   */
  @Post('royalties/withdrawals/otp')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async requestOtp(
    @Req() req: AuthenticatedRequest,
    @Body() body: RequestRoyaltyWithdrawalOtpDto,
  ) {
    await this.withdrawals.validate({
      userId: req.user.sub,
      tokenAmount: body.tokenAmount,
      payoutAccountId: body.payoutAccountId,
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const { destination, channel } = await resolveOtpDestination(user, this.settings);

    return this.otp.issueForUser(
      req.user.sub,
      // Its own purpose, not WITHDRAWAL: a code issued to move ordinary DL must
      // not be replayable to move royalty DL, and the two debit different
      // columns.
      OtpPurpose.ROYALTY_WITHDRAWAL,
      destination,
      royaltyWithdrawalContextHash({
        tokenAmount: body.tokenAmount,
        payoutAccountId: body.payoutAccountId,
      }),
      channel,
    );
  }

  @Post('royalties/withdrawals')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateRoyaltyWithdrawalDto) {
    // Verified BEFORE the debit, and bound to this exact amount and destination
    // so a code shown for one payout cannot authorise another.
    await this.otp.verify({
      otpRequestId: body.otpRequestId,
      userId: req.user.sub,
      purpose: OtpPurpose.ROYALTY_WITHDRAWAL,
      code: body.code,
      contextHash: royaltyWithdrawalContextHash({
        tokenAmount: body.tokenAmount,
        payoutAccountId: body.payoutAccountId,
      }),
    });

    return this.withdrawals.create({
      userId: req.user.sub,
      tokenAmount: body.tokenAmount,
      payoutAccountId: body.payoutAccountId,
    });
  }

  @Get('admin/royalties/withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listAll() {
    return this.prisma.royaltyWithdrawalRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        wallet: { select: { userId: true } },
        payoutAccount: {
          select: { id: true, type: true, currency: true, accountName: true },
        },
      },
    });
  }

  @Post('admin/royalties/withdrawals/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resolve(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ResolveRoyaltyWithdrawalDto,
  ) {
    return this.withdrawals.resolve({
      withdrawalId: id,
      outcome: body.outcome,
      adminId: req.user.sub,
      adminNote: body.adminNote,
    });
  }
}
