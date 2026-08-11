import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin-editable platform settings that previously only existed as env-var
 * defaults. Each getter checks the singleton PlatformSettings row first and
 * falls back to the env var when the column is null -- this is what lets
 * every existing deployment keep working unchanged (zero DB rows needed)
 * until an admin explicitly overrides a value from the Settings UI. Same
 * shape as WalletController.getReferralSettings's upsert-singleton pattern.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getRow() {
    return this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  async getTokenUsdRate(): Promise<number> {
    const row = await this.getRow();
    if (row.tokenUsdRate) {
      return row.tokenUsdRate.toNumber();
    }
    const raw = process.env.TOKEN_USD_RATE ?? '0.10';
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid TOKEN_USD_RATE: ${raw}`);
    }
    return rate;
  }

  async getMinWithdrawalTokens(): Promise<number> {
    const row = await this.getRow();
    if (row.minWithdrawalTokens) {
      return row.minWithdrawalTokens.toNumber();
    }
    const raw = process.env.MIN_WITHDRAWAL_TOKENS ?? '50';
    const min = Number(raw);
    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`Invalid MIN_WITHDRAWAL_TOKENS: ${raw}`);
    }
    return min;
  }

  async getTrainingPayoutBonusCapMultiple(): Promise<number> {
    const row = await this.getRow();
    if (row.trainingPayoutBonusCapMultiple) {
      return row.trainingPayoutBonusCapMultiple.toNumber();
    }
    const raw = process.env.TRAINING_PAYOUT_BONUS_CAP_MULTIPLE ?? '1.0';
    const cap = Number(raw);
    if (!Number.isFinite(cap) || cap < 0) {
      throw new Error(`Invalid TRAINING_PAYOUT_BONUS_CAP_MULTIPLE: ${raw}`);
    }
    return cap;
  }

  async getTaskTokenCost(): Promise<number> {
    const row = await this.getRow();
    if (row.taskTokenCost) {
      return row.taskTokenCost.toNumber();
    }
    const raw = process.env.TASK_TOKEN_COST ?? '1.0';
    const cost = Number(raw);
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error(`Invalid TASK_TOKEN_COST: ${raw}`);
    }
    return cost;
  }

  async isReverseWordTrainingEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.reverseWordTrainingEnabled;
  }

  async isAdminPayoutOtpEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.adminPayoutOtpEnabled;
  }

  async getWordStuckTimeoutHours(): Promise<number> {
    const row = await this.getRow();
    return row.wordStuckTimeoutHours;
  }

  async getResendFromAddress(): Promise<string> {
    const row = await this.getRow();
    return row.resendFromAddress ?? process.env.RESEND_FROM_ADDRESS ?? 'noreply@dialectlibrary.com';
  }

  async getLeadsNotificationAddress(): Promise<string> {
    const row = await this.getRow();
    return row.leadsNotificationAddress ?? process.env.LEADS_NOTIFICATION_ADDRESS ?? 'hello@dialectlibrary.com';
  }

  async getForAdmin() {
    const row = await this.getRow();
    return {
      tokenUsdRate: row.tokenUsdRate?.toString() ?? null,
      minWithdrawalTokens: row.minWithdrawalTokens?.toString() ?? null,
      resendFromAddress: row.resendFromAddress,
      leadsNotificationAddress: row.leadsNotificationAddress,
      trainingPayoutBonusCapMultiple: row.trainingPayoutBonusCapMultiple?.toString() ?? null,
      taskTokenCost: row.taskTokenCost?.toString() ?? null,
      reverseWordTrainingEnabled: row.reverseWordTrainingEnabled,
      adminPayoutOtpEnabled: row.adminPayoutOtpEnabled,
      wordStuckTimeoutHours: row.wordStuckTimeoutHours,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  async update(data: {
    tokenUsdRate?: number | null;
    minWithdrawalTokens?: number | null;
    resendFromAddress?: string | null;
    leadsNotificationAddress?: string | null;
    trainingPayoutBonusCapMultiple?: number | null;
    taskTokenCost?: number | null;
    reverseWordTrainingEnabled?: boolean;
    adminPayoutOtpEnabled?: boolean;
    wordStuckTimeoutHours?: number;
  }) {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    return {
      tokenUsdRate: row.tokenUsdRate?.toString() ?? null,
      minWithdrawalTokens: row.minWithdrawalTokens?.toString() ?? null,
      resendFromAddress: row.resendFromAddress,
      leadsNotificationAddress: row.leadsNotificationAddress,
      trainingPayoutBonusCapMultiple: row.trainingPayoutBonusCapMultiple?.toString() ?? null,
      taskTokenCost: row.taskTokenCost?.toString() ?? null,
      reverseWordTrainingEnabled: row.reverseWordTrainingEnabled,
      adminPayoutOtpEnabled: row.adminPayoutOtpEnabled,
      wordStuckTimeoutHours: row.wordStuckTimeoutHours,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }
}
