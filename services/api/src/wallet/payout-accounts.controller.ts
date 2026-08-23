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
  UseGuards,
} from '@nestjs/common';
import {
  PayoutAccountType,
  PayoutAccountVerificationStatus,
  WithdrawalStatus,
} from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { encryptPayoutField, maskAccountNumber } from '../common/payout-crypto.util';
import { FlutterwaveService } from './flutterwave.service';
import { CreatePayoutAccountDto } from './dto/create-payout-account.dto';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';

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
      const resolved = await this.flutterwave.resolveAccount({
        accountBank: dto.bankCode,
        accountNumber: dto.accountNumber,
      });
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
        },
      });
      return toPublicPayoutAccount(account);
    }

    throw new BadRequestException('Unsupported payout account type');
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

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.requireOwnedAccount(req.user.sub, id);
    const referencedByActiveWithdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: { payoutAccountId: id, status: { in: NON_TERMINAL_WITHDRAWAL_STATUSES } },
      select: { id: true },
    });
    if (referencedByActiveWithdrawal) {
      throw new BadRequestException(
        'This payout account is referenced by an in-progress withdrawal and cannot be deleted yet',
      );
    }
    await this.prisma.payoutAccount.delete({ where: { id } });
    return { deleted: true };
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
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  // Never includes accountNumberEncryptedJson/mobileMoneyNumberEncryptedJson
  // -- ordinary reads never touch the decrypt path.
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
    lastUsedAt: account.lastUsedAt,
    createdAt: account.createdAt,
  };
}
