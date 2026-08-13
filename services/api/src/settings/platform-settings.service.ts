import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const LLM_PROVIDER_KEYS = ['openai', 'deepseek', 'anthropic'];
const SMS_PROVIDER_KEYS = ['termii', 'twilio', 'africastalking'];
const SMS_TRANSACTIONAL_PROVIDER_KEYS = ['termii', 'twilio', 'africastalking', 'smslive247'];

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

  async isSpellingNormalizationEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.spellingNormalizationEnabled;
  }

  async getSpellingNormalizationProviderOrder(): Promise<string> {
    const row = await this.getRow();
    return row.spellingNormalizationProviderOrder;
  }

  async isSentenceRebuildEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.sentenceRebuildEnabled;
  }

  async getSmsProviderOrder(): Promise<string> {
    const row = await this.getRow();
    return row.smsProviderOrder;
  }

  async isSmslive247NativeOtpEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.smslive247NativeOtpEnabled;
  }

  async getSmsTransactionalProviderOrder(): Promise<string> {
    const row = await this.getRow();
    return row.smsTransactionalProviderOrder;
  }

  async isP2pSmsTradeCreatedEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.p2pSmsTradeCreatedEnabled;
  }

  async isP2pSmsPaymentMarkedEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.p2pSmsPaymentMarkedEnabled;
  }

  async isP2pSmsTokensReleasedEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.p2pSmsTokensReleasedEnabled;
  }

  async isP2pSmsCancelledEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.p2pSmsCancelledEnabled;
  }

  async isAdminPayoutOtpEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.adminPayoutOtpEnabled;
  }

  async isCryptoWithdrawalsEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.cryptoWithdrawalsEnabled;
  }

  async isNowPaymentsPayoutsEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.nowPaymentsPayoutsEnabled;
  }

  async getAllowedWithdrawalCurrencies(): Promise<string[]> {
    const row = await this.getRow();
    return row.allowedWithdrawalCurrencies.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  }

  async getAllowedWithdrawalNetworks(): Promise<string[]> {
    const row = await this.getRow();
    return row.allowedWithdrawalNetworks.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  }

  async getWithdrawalFeeSettings(): Promise<{ mode: string; tokenAmount: number; percent: number }> {
    const row = await this.getRow();
    return {
      mode: row.withdrawalFeeMode,
      tokenAmount: row.withdrawalFeeTokenAmount.toNumber(),
      percent: row.withdrawalFeePercent.toNumber(),
    };
  }

  async isAutoSubmitAfterApprovalEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.autoSubmitAfterApproval;
  }

  async getWordStuckTimeoutMinutes(): Promise<number> {
    const row = await this.getRow();
    return row.wordStuckTimeoutMinutes;
  }

  async getScoringSlaMinutes(): Promise<number> {
    const row = await this.getRow();
    return row.scoringSlaMinutes;
  }

  async isNoFailOnTrainEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.noFailOnTrainEnabled;
  }

  async getScoreRange(): Promise<{ min: number; max: number }> {
    const row = await this.getRow();
    return { min: row.minScoreRange.toNumber(), max: row.maxScoreRange.toNumber() };
  }

  async getResendFromAddress(): Promise<string> {
    const row = await this.getRow();
    return row.resendFromAddress ?? process.env.RESEND_FROM_ADDRESS ?? 'Dialect Library <noreply@dialectlibrary.com>';
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
      wordStuckTimeoutMinutes: row.wordStuckTimeoutMinutes,
      scoringSlaMinutes: row.scoringSlaMinutes,
      noFailOnTrainEnabled: row.noFailOnTrainEnabled,
      minScoreRange: row.minScoreRange.toString(),
      maxScoreRange: row.maxScoreRange.toString(),
      llmGenerationEnabled: row.llmGenerationEnabled,
      llmProviderOrder: row.llmProviderOrder,
      llmWordsPerItem: row.llmWordsPerItem,
      llmItemsPerRun: row.llmItemsPerRun,
      llmMaxPoolPerDialect: row.llmMaxPoolPerDialect,
      qualityGateEnabled: row.qualityGateEnabled,
      qualityWeightConsensus: row.qualityWeightConsensus.toString(),
      qualityWeightNoise: row.qualityWeightNoise.toString(),
      qualityWeightQuality: row.qualityWeightQuality.toString(),
      qualityWeightLiveness: row.qualityWeightLiveness.toString(),
      spellingNormalizationEnabled: row.spellingNormalizationEnabled,
      spellingNormalizationProviderOrder: row.spellingNormalizationProviderOrder,
      sentenceRebuildEnabled: row.sentenceRebuildEnabled,
      smsProviderOrder: row.smsProviderOrder,
      smslive247NativeOtpEnabled: row.smslive247NativeOtpEnabled,
      smsTransactionalProviderOrder: row.smsTransactionalProviderOrder,
      p2pSmsTradeCreatedEnabled: row.p2pSmsTradeCreatedEnabled,
      p2pSmsPaymentMarkedEnabled: row.p2pSmsPaymentMarkedEnabled,
      p2pSmsTokensReleasedEnabled: row.p2pSmsTokensReleasedEnabled,
      p2pSmsCancelledEnabled: row.p2pSmsCancelledEnabled,
      cryptoWithdrawalsEnabled: row.cryptoWithdrawalsEnabled,
      nowPaymentsPayoutsEnabled: row.nowPaymentsPayoutsEnabled,
      allowedWithdrawalCurrencies: row.allowedWithdrawalCurrencies,
      allowedWithdrawalNetworks: row.allowedWithdrawalNetworks,
      withdrawalFeeMode: row.withdrawalFeeMode,
      withdrawalFeeTokenAmount: row.withdrawalFeeTokenAmount.toString(),
      withdrawalFeePercent: row.withdrawalFeePercent.toString(),
      autoSubmitAfterApproval: row.autoSubmitAfterApproval,
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
    wordStuckTimeoutMinutes?: number;
    scoringSlaMinutes?: number;
    noFailOnTrainEnabled?: boolean;
    minScoreRange?: number;
    maxScoreRange?: number;
    llmGenerationEnabled?: boolean;
    llmProviderOrder?: string;
    llmWordsPerItem?: number;
    llmItemsPerRun?: number;
    llmMaxPoolPerDialect?: number;
    qualityGateEnabled?: boolean;
    qualityWeightConsensus?: number;
    qualityWeightNoise?: number;
    qualityWeightQuality?: number;
    qualityWeightLiveness?: number;
    spellingNormalizationEnabled?: boolean;
    spellingNormalizationProviderOrder?: string;
    sentenceRebuildEnabled?: boolean;
    smsProviderOrder?: string;
    smslive247NativeOtpEnabled?: boolean;
    smsTransactionalProviderOrder?: string;
    p2pSmsTradeCreatedEnabled?: boolean;
    p2pSmsPaymentMarkedEnabled?: boolean;
    p2pSmsTokensReleasedEnabled?: boolean;
    p2pSmsCancelledEnabled?: boolean;
    cryptoWithdrawalsEnabled?: boolean;
    nowPaymentsPayoutsEnabled?: boolean;
    allowedWithdrawalCurrencies?: string;
    allowedWithdrawalNetworks?: string;
    withdrawalFeeMode?: string;
    withdrawalFeeTokenAmount?: number;
    withdrawalFeePercent?: number;
    autoSubmitAfterApproval?: boolean;
  }) {
    if (data.llmProviderOrder) {
      const tokens = data.llmProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === LLM_PROVIDER_KEYS.length &&
        LLM_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === LLM_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException('llmProviderOrder must list openai, deepseek, and anthropic exactly once each');
      }
    }

    if (data.spellingNormalizationProviderOrder) {
      const tokens = data.spellingNormalizationProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === LLM_PROVIDER_KEYS.length &&
        LLM_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === LLM_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException('spellingNormalizationProviderOrder must list openai, deepseek, and anthropic exactly once each');
      }
    }

    if (data.smsProviderOrder) {
      const tokens = data.smsProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === SMS_PROVIDER_KEYS.length &&
        SMS_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === SMS_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException('smsProviderOrder must list termii, twilio, and africastalking exactly once each');
      }
    }

    if (data.smsTransactionalProviderOrder) {
      const tokens = data.smsTransactionalProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === SMS_TRANSACTIONAL_PROVIDER_KEYS.length &&
        SMS_TRANSACTIONAL_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === SMS_TRANSACTIONAL_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException('smsTransactionalProviderOrder must list termii, twilio, africastalking, and smslive247 exactly once each');
      }
    }

    const SUPPORTED_WITHDRAWAL_CURRENCIES = ['USDT', 'USDC'];
    const SUPPORTED_WITHDRAWAL_NETWORKS = ['TRC20', 'ERC20', 'BEP20', 'SOL', 'POLYGON'];

    if (data.allowedWithdrawalCurrencies) {
      const tokens = data.allowedWithdrawalCurrencies.split(',').map((v) => v.trim().toUpperCase());
      if (tokens.length === 0 || !tokens.every((t) => SUPPORTED_WITHDRAWAL_CURRENCIES.includes(t))) {
        throw new BadRequestException(`allowedWithdrawalCurrencies must be a non-empty CSV subset of ${SUPPORTED_WITHDRAWAL_CURRENCIES.join(', ')}`);
      }
    }

    if (data.allowedWithdrawalNetworks) {
      const tokens = data.allowedWithdrawalNetworks.split(',').map((v) => v.trim().toUpperCase());
      if (tokens.length === 0 || !tokens.every((t) => SUPPORTED_WITHDRAWAL_NETWORKS.includes(t))) {
        throw new BadRequestException(`allowedWithdrawalNetworks must be a non-empty CSV subset of ${SUPPORTED_WITHDRAWAL_NETWORKS.join(', ')}`);
      }
    }

    if (data.withdrawalFeeMode && !['platform', 'user'].includes(data.withdrawalFeeMode)) {
      throw new BadRequestException('withdrawalFeeMode must be "platform" or "user"');
    }

    const anyWeightProvided =
      data.qualityWeightConsensus !== undefined ||
      data.qualityWeightNoise !== undefined ||
      data.qualityWeightQuality !== undefined ||
      data.qualityWeightLiveness !== undefined;
    if (anyWeightProvided) {
      // A partial weight update can't be validated in isolation -- the sum
      // check needs all four values, so read whatever isn't in this patch
      // off the existing row first.
      const existing = await this.getRow();
      const consensus = data.qualityWeightConsensus ?? existing.qualityWeightConsensus.toNumber();
      const noise = data.qualityWeightNoise ?? existing.qualityWeightNoise.toNumber();
      const quality = data.qualityWeightQuality ?? existing.qualityWeightQuality.toNumber();
      const liveness = data.qualityWeightLiveness ?? existing.qualityWeightLiveness.toNumber();
      const sum = consensus + noise + quality + liveness;
      if (Math.abs(sum - 100) > 0.01) {
        throw new BadRequestException('qualityWeightConsensus/Noise/Quality/Liveness must sum to 100');
      }
    }

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
      wordStuckTimeoutMinutes: row.wordStuckTimeoutMinutes,
      scoringSlaMinutes: row.scoringSlaMinutes,
      noFailOnTrainEnabled: row.noFailOnTrainEnabled,
      minScoreRange: row.minScoreRange.toString(),
      maxScoreRange: row.maxScoreRange.toString(),
      llmGenerationEnabled: row.llmGenerationEnabled,
      llmProviderOrder: row.llmProviderOrder,
      llmWordsPerItem: row.llmWordsPerItem,
      llmItemsPerRun: row.llmItemsPerRun,
      llmMaxPoolPerDialect: row.llmMaxPoolPerDialect,
      qualityGateEnabled: row.qualityGateEnabled,
      qualityWeightConsensus: row.qualityWeightConsensus.toString(),
      qualityWeightNoise: row.qualityWeightNoise.toString(),
      qualityWeightQuality: row.qualityWeightQuality.toString(),
      qualityWeightLiveness: row.qualityWeightLiveness.toString(),
      spellingNormalizationEnabled: row.spellingNormalizationEnabled,
      spellingNormalizationProviderOrder: row.spellingNormalizationProviderOrder,
      sentenceRebuildEnabled: row.sentenceRebuildEnabled,
      smsProviderOrder: row.smsProviderOrder,
      smslive247NativeOtpEnabled: row.smslive247NativeOtpEnabled,
      smsTransactionalProviderOrder: row.smsTransactionalProviderOrder,
      p2pSmsTradeCreatedEnabled: row.p2pSmsTradeCreatedEnabled,
      p2pSmsPaymentMarkedEnabled: row.p2pSmsPaymentMarkedEnabled,
      p2pSmsTokensReleasedEnabled: row.p2pSmsTokensReleasedEnabled,
      p2pSmsCancelledEnabled: row.p2pSmsCancelledEnabled,
      cryptoWithdrawalsEnabled: row.cryptoWithdrawalsEnabled,
      nowPaymentsPayoutsEnabled: row.nowPaymentsPayoutsEnabled,
      allowedWithdrawalCurrencies: row.allowedWithdrawalCurrencies,
      allowedWithdrawalNetworks: row.allowedWithdrawalNetworks,
      withdrawalFeeMode: row.withdrawalFeeMode,
      withdrawalFeeTokenAmount: row.withdrawalFeeTokenAmount.toString(),
      withdrawalFeePercent: row.withdrawalFeePercent.toString(),
      autoSubmitAfterApproval: row.autoSubmitAfterApproval,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }
}
