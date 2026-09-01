import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  OtpPurpose,
  P2POfferStatus,
  PayoutAccountType,
  PayoutAccountVerificationStatus,
  WithdrawalStatus,
} from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { OtpService } from '../otp/otp.service';
import { encryptPayoutField, maskAccountNumber } from '../common/payout-crypto.util';
import { payoutAccountDeleteContextHash } from './otp-context.util';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwaveV4Service, RecipientCountry } from './flutterwave-v4.service';
import { StripeConnectService } from './stripe-connect.service';
import { CreatePayoutAccountDto } from './dto/create-payout-account.dto';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
import { ConfirmPayoutAccountDeleteDto } from './dto/confirm-payout-account-delete.dto';

function stripeFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
}

const NON_TERMINAL_WITHDRAWAL_STATUSES: WithdrawalStatus[] = [
  WithdrawalStatus.PENDING,
  WithdrawalStatus.APPROVED,
  WithdrawalStatus.PROCESSING,
];

@Controller('payout-accounts')
export class PayoutAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwave: FlutterwaveService,
    private readonly flutterwaveV4: FlutterwaveV4Service,
    private readonly stripeConnect: StripeConnectService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly otp: OtpService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: AuthenticatedRequest) {
    const accounts = await this.prisma.payoutAccount.findMany({
      where: { userId: req.user.sub },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return accounts.map(toPublicPayoutAccount);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePayoutAccountDto) {
    if (dto.type === 'BANK') {
      if (!dto.bankCode || !dto.accountNumber) {
        throw new BadRequestException('bankCode and accountNumber are required for a bank account');
      }
      // v3's resolveAccount remains the account-name verification source of
      // truth even under the v4 toggle -- v4 recipient creation doesn't
      // verify the account holder's name the same way (see
      // FlutterwaveV4Service's createRecipient doc comment).
      const resolved = await this.flutterwave.resolveAccount({
        accountBank: dto.bankCode,
        accountNumber: dto.accountNumber,
      });
      const providerRecipientId = (await this.platformSettings.isFlutterwaveV4Enabled())
        ? (
            await this.flutterwaveV4.createRecipient({
              type: 'bank',
              country: dto.country.toUpperCase() as RecipientCountry,
              bankCode: dto.bankCode,
              accountNumber: dto.accountNumber,
              ...splitName(resolved.accountName),
            })
          ).recipientId
        : null;
      const account = await this.prisma.payoutAccount.create({
        data: {
          userId: req.user.sub,
          type: PayoutAccountType.BANK,
          country: dto.country,
          currency: dto.currency,
          isDefault: dto.isDefault ?? false,
          verificationStatus: PayoutAccountVerificationStatus.VERIFIED,
          bankCode: dto.bankCode,
          accountNumberEncryptedJson: { ...encryptPayoutField(dto.accountNumber) },
          accountNumberMasked: maskAccountNumber(dto.accountNumber),
          accountName: resolved.accountName,
          providerRecipientId,
        },
      });
      return toPublicPayoutAccount(account);
    }

    if (dto.type === 'MOBILE_MONEY') {
      if (!dto.mobileMoneyNetwork || !dto.mobileMoneyNumber) {
        throw new BadRequestException(
          'mobileMoneyNetwork and mobileMoneyNumber are required for a mobile money account',
        );
      }
      // No account-resolve endpoint is confirmed for Flutterwave v3 mobile
      // money -- stored UNVERIFIED, the frontend warns the trainer to
      // double-check the number before saving.
      let providerRecipientId: string | null = null;
      if (await this.platformSettings.isFlutterwaveV4Enabled()) {
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: req.user.sub },
          select: { firstName: true, lastName: true },
        });
        providerRecipientId = (
          await this.flutterwaveV4.createRecipient({
            type: 'mobile_money',
            country: dto.country.toUpperCase() as RecipientCountry,
            network: dto.mobileMoneyNetwork,
            phoneNumber: dto.mobileMoneyNumber,
            firstName: user.firstName ?? 'Trainer',
            lastName: user.lastName ?? 'Account',
          })
        ).recipientId;
      }
      const account = await this.prisma.payoutAccount.create({
        data: {
          userId: req.user.sub,
          type: PayoutAccountType.MOBILE_MONEY,
          country: dto.country,
          currency: dto.currency,
          isDefault: dto.isDefault ?? false,
          verificationStatus: PayoutAccountVerificationStatus.UNVERIFIED,
          mobileMoneyNetwork: dto.mobileMoneyNetwork,
          mobileMoneyNumberEncryptedJson: { ...encryptPayoutField(dto.mobileMoneyNumber) },
          mobileMoneyNumberMasked: maskAccountNumber(dto.mobileMoneyNumber),
          providerRecipientId,
        },
      });
      return toPublicPayoutAccount(account);
    }

    if (dto.type === 'STRIPE_CONNECT') {
      if (!(await this.platformSettings.isStripePayoutsEnabled())) {
        throw new UnprocessableEntityException('Stripe payouts are currently disabled');
      }
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: { email: true },
      });
      const { stripeAccountId } = await this.stripeConnect.createConnectedAccount({
        email: user.email,
        country: dto.country.toUpperCase(),
      });
      const account = await this.prisma.payoutAccount.create({
        data: {
          userId: req.user.sub,
          type: PayoutAccountType.STRIPE_CONNECT,
          country: dto.country,
          currency: dto.currency,
          provider: 'stripe',
          isDefault: dto.isDefault ?? false,
          verificationStatus: PayoutAccountVerificationStatus.PENDING,
          stripeConnectAccountId: stripeAccountId,
          stripeDetailsSubmitted: false,
          stripePayoutsEnabled: false,
        },
      });
      const link = await this.stripeConnect.createOnboardingLink(
        stripeAccountId,
        `${stripeFrontendUrl()}/payout-accounts/${account.id}/stripe/refresh`,
        `${stripeFrontendUrl()}/payout-accounts/${account.id}/stripe/return`,
      );
      return { ...toPublicPayoutAccount(account), onboardingUrl: link.url };
    }

    throw new BadRequestException('Unsupported payout account type');
  }

  /** Regenerates a fresh onboarding Account Link for an existing STRIPE_CONNECT account -- Account Links expire, so a trainer who didn't finish (or wants to update) onboarding needs a way to get a new one without recreating the connected account itself. */
  @Post(':id/stripe/onboarding-link')
  @UseGuards(JwtAuthGuard)
  async createStripeOnboardingLink(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const account = await this.requireOwnedAccount(req.user.sub, id);
    if (account.type !== PayoutAccountType.STRIPE_CONNECT || !account.stripeConnectAccountId) {
      throw new BadRequestException('This payout account is not a Stripe Connect account');
    }
    if (!(await this.platformSettings.isStripePayoutsEnabled())) {
      throw new UnprocessableEntityException('Stripe payouts are currently disabled');
    }
    const link = await this.stripeConnect.createOnboardingLink(
      account.stripeConnectAccountId,
      `${stripeFrontendUrl()}/payout-accounts/${account.id}/stripe/refresh`,
      `${stripeFrontendUrl()}/payout-accounts/${account.id}/stripe/return`,
    );
    return { onboardingUrl: link.url };
  }

  /** Manual-refresh fallback alongside the account.updated webhook path (see WalletController.handleStripeWebhook) -- lets the frontend force a fresh read of onboarding status right after the trainer returns from Stripe's hosted flow, without waiting on webhook delivery. */
  @Post(':id/stripe/refresh-status')
  @UseGuards(JwtAuthGuard)
  async refreshStripeAccountStatus(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const account = await this.requireOwnedAccount(req.user.sub, id);
    if (account.type !== PayoutAccountType.STRIPE_CONNECT || !account.stripeConnectAccountId) {
      throw new BadRequestException('This payout account is not a Stripe Connect account');
    }
    const status = await this.stripeConnect.getAccountStatus(account.stripeConnectAccountId);
    const updated = await this.prisma.payoutAccount.update({
      where: { id },
      data: {
        stripeDetailsSubmitted: status.detailsSubmitted,
        stripePayoutsEnabled: status.payoutsEnabled,
        verificationStatus: status.payoutsEnabled
          ? PayoutAccountVerificationStatus.VERIFIED
          : PayoutAccountVerificationStatus.PENDING,
      },
    });
    return toPublicPayoutAccount(updated);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePayoutAccountDto,
  ) {
    await this.requireOwnedAccount(req.user.sub, id);
    const account = await this.prisma.payoutAccount.update({
      where: { id },
      data: { isDefault: dto.isDefault },
    });
    return toPublicPayoutAccount(account);
  }

  /**
   * Deletion always requires email OTP confirmation -- same reasoning as
   * wallet/withdrawals/otp: removing a saved payout destination is a
   * trainer-initiated, financially consequential action, so this is
   * unconditional (no PlatformSettings toggle), matching the withdrawal-OTP
   * precedent rather than the admin-payout-OTP precedent (which is
   * admin-toggleable, since that gate is about an admin's own power, not a
   * trainer's account safety).
   */
  @Post(':id/delete/otp')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async requestDeleteOtp(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    await this.requireDeletable(req.user.sub, id);
    const contextHash = payoutAccountDeleteContextHash({ payoutAccountId: id });
    return this.otp.issueForUser(req.user.sub, OtpPurpose.PAYOUT_ACCOUNT_DELETE, user.email, contextHash);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ConfirmPayoutAccountDeleteDto,
  ) {
    await this.requireDeletable(req.user.sub, id);
    await this.otp.verify({
      otpRequestId: body.otpRequestId,
      userId: req.user.sub,
      purpose: OtpPurpose.PAYOUT_ACCOUNT_DELETE,
      code: body.code,
      contextHash: payoutAccountDeleteContextHash({ payoutAccountId: id }),
    });
    await this.prisma.payoutAccount.delete({ where: { id } });
    return { deleted: true };
  }

  /** Shared owned/referenced checks used by both the OTP-request and the executing delete route, so a request can't be issued for an account that's about to fail these checks anyway. */
  private async requireDeletable(userId: string, id: string) {
    await this.requireOwnedAccount(userId, id);
    const referencedByActiveWithdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: { payoutAccountId: id, status: { in: NON_TERMINAL_WITHDRAWAL_STATUSES } },
      select: { id: true },
    });
    if (referencedByActiveWithdrawal) {
      throw new BadRequestException(
        'This payout account is referenced by an in-progress withdrawal and cannot be deleted yet',
      );
    }
    const referencedByOpenP2pOffer = await this.prisma.p2PTokenOffer.findFirst({
      where: {
        paymentMethodId: id,
        status: { in: [P2POfferStatus.ACTIVE, P2POfferStatus.RESERVED] },
      },
      select: { id: true },
    });
    if (referencedByOpenP2pOffer) {
      throw new BadRequestException(
        'This payout account is used by an open P2P offer -- cancel or complete it first',
      );
    }
  }

  private async requireOwnedAccount(userId: string, id: string) {
    const account = await this.prisma.payoutAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('Payout account not found');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this payout account');
    }
    return account;
  }
}

function toPublicPayoutAccount(account: {
  id: string;
  type: PayoutAccountType;
  country: string;
  currency: string;
  provider: string;
  isDefault: boolean;
  verificationStatus: PayoutAccountVerificationStatus;
  bankCode: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  accountName: string | null;
  mobileMoneyNetwork: string | null;
  mobileMoneyNumberMasked: string | null;
  stripeConnectAccountId: string | null;
  stripeDetailsSubmitted: boolean;
  stripePayoutsEnabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  // Never includes accountNumberEncryptedJson/mobileMoneyNumberEncryptedJson
  // -- ordinary reads never touch the decrypt path. stripeConnectAccountId
  // is fine to include (not secret) -- it's the same acct_... id Stripe's
  // own dashboard shows a connected user.
  return {
    id: account.id,
    type: account.type,
    country: account.country,
    currency: account.currency,
    provider: account.provider,
    isDefault: account.isDefault,
    verificationStatus: account.verificationStatus,
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountNumberMasked: account.accountNumberMasked,
    accountName: account.accountName,
    mobileMoneyNetwork: account.mobileMoneyNetwork,
    mobileMoneyNumberMasked: account.mobileMoneyNumberMasked,
    stripeConnectAccountId: account.stripeConnectAccountId,
    stripeDetailsSubmitted: account.stripeDetailsSubmitted,
    stripePayoutsEnabled: account.stripePayoutsEnabled,
    lastUsedAt: account.lastUsedAt,
    createdAt: account.createdAt,
  };
}

/** Flutterwave v4 recipients want name.first/name.last; Flutterwave's own resolveAccount only returns one combined string -- best-effort split on the first space, last word(s) as the surname. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
