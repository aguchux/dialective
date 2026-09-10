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
const ROW_CACHE_TTL_MS = 5_000;

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Every getter/setter below funnels through getRow(), and a single
  // request can easily call several of them (e.g. WalletController.
  // getTrainerDashboard reads 6+ settings) -- without this cache each of
  // those was its own upsert() round-trip to Postgres. A short TTL keeps
  // admin changes visible within seconds without needing explicit
  // invalidation wiring, while collapsing bursts of same-request reads
  // into one query. update() below still always writes through and
  // refreshes the cache immediately so admins see their own change
  // reflected in the same response.
  private cachedRow: Awaited<ReturnType<PlatformSettingsService['fetchRow']>> | null = null;
  private cachedAt = 0;

  private async fetchRow() {
    return this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  private async getRow() {
    const now = Date.now();
    if (this.cachedRow && now - this.cachedAt < ROW_CACHE_TTL_MS) {
      return this.cachedRow;
    }
    const row = await this.fetchRow();
    this.cachedRow = row;
    this.cachedAt = now;
    return row;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number, envName: string): number {
    const value = raw ?? String(fallback);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${envName}: ${value}`);
    }
    return parsed;
  }

  /**
   * Single check point for every auth entry route (register/login/magic-link
   * request) and for JwtAuthGuard (already-authenticated requests, gated
   * separately by blockSessions). Self-healing: if authMaintenanceEnabled is
   * true but authMaintenanceUntil has already passed, this clears every
   * maintenance field in the DB right here (not just in the returned value)
   * so the admin dashboard's next GET reflects "off" without a human having
   * to remember to flip the toggle back.
   */
  async getAuthMaintenanceStatus(): Promise<{
    enabled: boolean;
    until: Date | null;
    message: string | null;
    blockLogin: boolean;
    blockSignup: boolean;
    blockSessions: boolean;
    excludeAdmin: boolean;
    excludePartner: boolean;
  }> {
    const row = await this.getRow();
    const disabled = {
      enabled: false,
      until: null,
      message: null,
      blockLogin: false,
      blockSignup: false,
      blockSessions: false,
      excludeAdmin: true,
      excludePartner: false,
    };
    if (!row.authMaintenanceEnabled) {
      return disabled;
    }
    if (row.authMaintenanceUntil && row.authMaintenanceUntil.getTime() <= Date.now()) {
      const cleared = await this.prisma.platformSettings.update({
        where: { id: 'default' },
        data: {
          authMaintenanceEnabled: false,
          authMaintenanceUntil: null,
          authMaintenanceMessage: null,
        },
      });
      this.cachedRow = cleared;
      this.cachedAt = Date.now();
      return disabled;
    }
    return {
      enabled: true,
      until: row.authMaintenanceUntil,
      message: row.authMaintenanceMessage,
      blockLogin: row.authMaintenanceBlockLogin,
      blockSignup: row.authMaintenanceBlockSignup,
      blockSessions: row.authMaintenanceBlockSessions,
      excludeAdmin: row.authMaintenanceExcludeAdmin,
      excludePartner: row.authMaintenanceExcludePartner,
    };
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

  async getMinWalletBalanceTokens(): Promise<number> {
    const row = await this.getRow();
    return row.minWalletBalanceTokens.toNumber();
  }

  async getMinCompletedTasksForWithdrawal(): Promise<number> {
    const row = await this.getRow();
    if (
      row.minCompletedTasksForWithdrawal !== null &&
      row.minCompletedTasksForWithdrawal !== undefined
    ) {
      return row.minCompletedTasksForWithdrawal;
    }
    const raw = process.env.MIN_COMPLETED_TASKS_FOR_WITHDRAWAL ?? '100';
    const min = Number(raw);
    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`Invalid MIN_COMPLETED_TASKS_FOR_WITHDRAWAL: ${raw}`);
    }
    return min;
  }

  /** Reads fresh (not cached) -- see PlatformRateLimitGuard, which calls this on every /auth/register request and needs an admin's change to take effect without waiting out ROW_CACHE_TTL_MS. */
  async getRegisterRateLimitPerHour(): Promise<number> {
    const row = await this.fetchRow();
    if (row.registerRateLimitPerHour) {
      return row.registerRateLimitPerHour;
    }
    return this.parsePositiveInt(
      process.env.REGISTER_RATE_LIMIT_PER_HOUR,
      30,
      'REGISTER_RATE_LIMIT_PER_HOUR',
    );
  }

  /** Reads fresh (not cached) -- SubmissionRateLimitGuard calls both this and getSubmissionRateLimitPerHour on every /words/recordings request, and needs an admin's toggle to take effect without waiting out ROW_CACHE_TTL_MS. */
  async isSubmissionRateLimitEnabled(): Promise<boolean> {
    const row = await this.fetchRow();
    return row.submissionRateLimitEnabled;
  }

  /** Reads fresh (not cached) -- see isSubmissionRateLimitEnabled. */
  async getSubmissionRateLimitPerHour(): Promise<number> {
    const row = await this.fetchRow();
    return row.submissionRateLimitPerHour;
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

  async isQracEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.qracEnabled;
  }

  async isQracRequiredAtSessionStart(): Promise<boolean> {
    const row = await this.getRow();
    return row.qracRequiredAtSessionStart;
  }

  async getQracIntervalMinutes(): Promise<number> {
    const row = await this.getRow();
    return row.qracIntervalMinutes;
  }

  async isTestimonyEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.testimonyEnabled;
  }

  async getTestimonyMaxTextLength(): Promise<number> {
    const row = await this.getRow();
    return row.testimonyMaxTextLength;
  }

  async getTestimonyMaxVideoSeconds(): Promise<number> {
    const row = await this.getRow();
    return row.testimonyMaxVideoSeconds;
  }

  async getTestimonyLandingLimit(): Promise<number> {
    const row = await this.getRow();
    return row.testimonyLandingLimit;
  }

  async getTestimonyTextRewardTokens(): Promise<number> {
    const row = await this.getRow();
    return row.testimonyTextRewardTokens.toNumber();
  }

  async getTestimonyVideoRewardTokens(): Promise<number> {
    const row = await this.getRow();
    return row.testimonyVideoRewardTokens.toNumber();
  }

  /** Reads fresh (not cached) -- weekly-trainer-report.ts checks this once at job start, so a stale cached read isn't a concern the way it would be for a per-request getter, but freshness costs nothing here either. */
  async isWeeklyTrainerReportEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.weeklyTrainerReportEnabled;
  }

  /**
   * Per-card visibility for the landing page's 5-stat row -- consumed by
   * GeoController.getStats. The DB column is still named
   * landingShowPoolVolume (unrenamed to avoid a migration for a purely
   * cosmetic change) but now gates the "Total Recordings" card -- the
   * subscription-pool concept it originally named has been retired in
   * favor of Tokenomics minting/reserve automation.
   */
  async getLandingVisibility() {
    const row = await this.getRow();
    return {
      countries: row.landingShowCountries,
      dialects: row.landingShowDialects,
      trainers: row.landingShowTrainers,
      totalRecordings: row.landingShowPoolVolume,
      payout: row.landingShowPayout,
    };
  }

  async isSpellingNormalizationEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.spellingNormalizationEnabled;
  }

  /** Master kill switch for quality-gate-worker's optional emotion/prosody analysis pass (services/quality-gate-worker/expression.py). Purely descriptive -- never feeds compositeScore/payout. */
  async isSpeechExpressionEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.speechExpressionEnabled;
  }

  async getSpellingNormalizationProviderOrder(): Promise<string> {
    const row = await this.getRow();
    return row.spellingNormalizationProviderOrder;
  }

  async isWordTrainingEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.wordTrainingEnabled;
  }

  async isSentenceTrainingEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.sentenceTrainingEnabled;
  }

  async isPhraseEscalationEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.phraseEscalationEnabled;
  }

  async isPhraseTierGenerationEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.phraseTierGenerationEnabled;
  }

  async getPhraseTierItemsPerTierPerRun(): Promise<number> {
    const row = await this.getRow();
    return row.phraseTierItemsPerTierPerRun;
  }

  async getSmsProviderOrder(): Promise<string> {
    const row = await this.getRow();
    return row.smsProviderOrder;
  }

  /** Admin-configured sender ID override for Termii/SMSLive247/Africa's Talking (and SMSLive247's native-OTP route); null means each provider uses its own env var. */
  async getSmsSenderId(): Promise<string | null> {
    const row = await this.getRow();
    return row.smsSenderId;
  }

  async isSmslive247NativeOtpEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.smslive247NativeOtpEnabled;
  }

  async isSmsTransactionalOtpEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.smsTransactionalOtpEnabled;
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

  async isWalletSmsWithdrawalPaidEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.walletSmsWithdrawalPaidEnabled;
  }

  async isWalletSmsWithdrawalRejectedEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.walletSmsWithdrawalRejectedEnabled;
  }

  async isWalletSmsWithdrawalFailedEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.walletSmsWithdrawalFailedEnabled;
  }

  async isWalletSmsDepositConfirmedEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.walletSmsDepositConfirmedEnabled;
  }

  async isReferralSmsFundingBonusEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.referralSmsFundingBonusEnabled;
  }

  async isReferralSmsPayoutBonusEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.referralSmsPayoutBonusEnabled;
  }

  async isPhoneVerificationRequired(): Promise<boolean> {
    const row = await this.getRow();
    return row.phoneVerificationRequired;
  }

  async getSessionIdleTimeoutMinutes(): Promise<number> {
    const row = await this.getRow();
    return row.sessionIdleTimeoutMinutes;
  }

  async getSessionMaxHours(): Promise<number> {
    const row = await this.getRow();
    return row.sessionMaxHours;
  }

  async getManualPhoneVerificationSettings(): Promise<{
    enabled: boolean;
    feeTokens: number;
    whatsappNumber: string;
    expiryMinutes: number;
  }> {
    const row = await this.getRow();
    return {
      enabled: row.manualPhoneVerificationEnabled,
      feeTokens: row.manualPhoneVerificationFeeTokens.toNumber(),
      whatsappNumber: row.manualPhoneVerificationWhatsappNumber,
      expiryMinutes: row.manualPhoneVerificationExpiryMinutes,
    };
  }

  /** null/unset or <= 0 means the one-time signup bonus is off. */
  async getStartupBonusAmount(): Promise<number> {
    const row = await this.getRow();
    return row.startupBonusAmount?.toNumber() ?? 0;
  }

  /** Widget only actually loads when enabled AND both IDs are set -- a half-configured row (e.g. enabled toggled on before saving IDs) must not leak an empty embed. */
  async getTawkToWidget(): Promise<{
    enabled: boolean;
    propertyId: string | null;
    widgetId: string | null;
  }> {
    const row = await this.getRow();
    const enabled =
      row.tawkToEnabled && Boolean(row.tawkToPropertyId) && Boolean(row.tawkToWidgetId);
    return {
      enabled,
      propertyId: enabled ? row.tawkToPropertyId : null,
      widgetId: enabled ? row.tawkToWidgetId : null,
    };
  }

  async getSupportChatSettings(): Promise<{ mode: 'NONE' | 'TAWK' | 'AI' }> {
    const row = await this.getRow();
    const mode = row.supportChatMode.toUpperCase();
    return { mode: mode === 'AI' || mode === 'NONE' ? mode : 'TAWK' };
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
    return row.allowedWithdrawalCurrencies
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }

  async getAllowedWithdrawalNetworks(): Promise<string[]> {
    const row = await this.getRow();
    return row.allowedWithdrawalNetworks
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }

  async isFlutterwaveFundingEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.isFlutterwaveFundingEnabled;
  }

  async isFlutterwavePayoutsEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.isFlutterwavePayoutsEnabled;
  }

  async isFlutterwaveV4Enabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.isFlutterwaveV4Enabled;
  }

  async getFlutterwaveV4SenderId(): Promise<string | null> {
    const row = await this.getRow();
    return row.flutterwaveV4SenderId;
  }

  async isStripePayoutsEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.isStripePayoutsEnabled;
  }

  async getAllowedFlutterwaveCurrencies(): Promise<string[]> {
    const row = await this.getRow();
    return row.allowedFlutterwaveCurrencies
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }

  async getAllowedFlutterwaveCountries(): Promise<string[]> {
    const row = await this.getRow();
    return row.allowedFlutterwaveCountries
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }

  async isKycRequiredForWithdrawals(): Promise<boolean> {
    const row = await this.getRow();
    return row.isKycRequiredForWithdrawals;
  }

  async getKycMinWithdrawalTokens(): Promise<number> {
    const row = await this.getRow();
    return row.kycMinWithdrawalTokens.toNumber();
  }

  async isKycRequiredOnboarding(): Promise<boolean> {
    const row = await this.getRow();
    return row.isKycRequiredOnboarding;
  }

  async getKycAutoCancelStaleSettings(): Promise<{ enabled: boolean; minutes: number }> {
    const row = await this.getRow();
    return { enabled: row.kycAutoCancelStaleEnabled, minutes: row.kycAutoCancelStaleMinutes };
  }

  async getWithdrawalFeeSettings(): Promise<{
    mode: string;
    tokenAmount: number;
    percent: number;
  }> {
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

  async getAuditHoldEveryNSubmissions(): Promise<number> {
    const row = await this.getRow();
    return row.auditHoldEveryNSubmissions;
  }

  async getValidationRewardPerRecording(): Promise<number> {
    const row = await this.getRow();
    return row.validationRewardPerRecording.toNumber();
  }

  async getValidatorDeckMaxItems(): Promise<number> {
    const row = await this.getRow();
    return row.validatorDeckMaxItems;
  }

  /** Additive approval-chain bonus (% of a deck's base reward) -- see packages/db/src/validator-payouts.ts for the full payout split math. */
  async getValidatorL1ApprovalBonusPercent(): Promise<number> {
    const row = await this.getRow();
    return row.validatorL1ApprovalBonusPercent.toNumber();
  }

  async getValidatorL2ApprovalBonusPercent(): Promise<number> {
    const row = await this.getRow();
    return row.validatorL2ApprovalBonusPercent.toNumber();
  }

  async getValidatorL3ApprovalBonusPercent(): Promise<number> {
    const row = await this.getRow();
    return row.validatorL3ApprovalBonusPercent.toNumber();
  }

  /** Global default for reassign()'s admin-settable per-reassignment penalty; see ValidatorDeck.effectiveReassignmentPenaltyPercent for why the effective value is frozen per-deck instead of always reading this live. */
  async getValidatorReassignmentPenaltyPercent(): Promise<number> {
    const row = await this.getRow();
    return row.validatorReassignmentPenaltyPercent.toNumber();
  }

  async getSettlementDelayMinutes(): Promise<number> {
    const row = await this.getRow();
    return row.settlementDelayMinutes;
  }

  async isNoFailOnTrainEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.noFailOnTrainEnabled;
  }

  async getScoreRange(): Promise<{ min: number; max: number }> {
    const row = await this.getRow();
    return { min: row.minScoreRange.toNumber(), max: row.maxScoreRange.toNumber() };
  }

  /** Mirrors settlement-job's own duplicated read of this column -- see its isQualityGateEnabled doc comment for why that duplication exists (separate deployable, can't import this service). */
  async isQualityGateEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.qualityGateEnabled;
  }

  async getQualityWeights(): Promise<{
    consensus: number;
    noise: number;
    quality: number;
    liveness: number;
  }> {
    const row = await this.getRow();
    return {
      consensus: row.qualityWeightConsensus.toNumber(),
      noise: row.qualityWeightNoise.toNumber(),
      quality: row.qualityWeightQuality.toNumber(),
      liveness: row.qualityWeightLiveness.toNumber(),
    };
  }

  /** WordRecording-only weight -- see settlement-job's getAsrMatchWeight doc comment. */
  async getAsrMatchWeight(): Promise<number> {
    const row = await this.getRow();
    return row.qualityWeightAsrMatch.toNumber();
  }

  async getResendFromAddress(): Promise<string> {
    const row = await this.getRow();
    return (
      row.resendFromAddress ??
      process.env.RESEND_FROM_ADDRESS ??
      'Dialect Library <noreply@dialectlibrary.com>'
    );
  }

  async getLeadsNotificationAddress(): Promise<string> {
    const row = await this.getRow();
    return (
      row.leadsNotificationAddress ??
      process.env.LEADS_NOTIFICATION_ADDRESS ??
      'hello@dialectlibrary.com'
    );
  }

  async getReferralCookiePersistSeconds(): Promise<number> {
    const row = await this.getRow();
    if (row.referralCookiePersistSeconds !== null) {
      return row.referralCookiePersistSeconds;
    }
    return this.parsePositiveInt(
      process.env.REFERRAL_COOKIE_PERSIST_SECONDS,
      24 * 60 * 60,
      'REFERRAL_COOKIE_PERSIST_SECONDS',
    );
  }

  async getReferralInviteExpirySeconds(): Promise<number> {
    const row = await this.getRow();
    if (row.referralInviteExpirySeconds !== null) {
      return row.referralInviteExpirySeconds;
    }
    return this.parsePositiveInt(
      process.env.REFERRAL_INVITE_EXPIRY_SECONDS,
      24 * 60 * 60,
      'REFERRAL_INVITE_EXPIRY_SECONDS',
    );
  }

  async getWordTrainingRecordingTimeoutSeconds(): Promise<number> {
    const row = await this.getRow();
    if (row.wordTrainingRecordingTimeoutSeconds !== null) {
      return row.wordTrainingRecordingTimeoutSeconds;
    }
    return this.parsePositiveInt(
      process.env.WORD_TRAINING_RECORDING_TIMEOUT_SECONDS,
      5,
      'WORD_TRAINING_RECORDING_TIMEOUT_SECONDS',
    );
  }

  async getWordTrainingRecordingMaxTimeoutSeconds(): Promise<number> {
    const row = await this.getRow();
    if (row.wordTrainingRecordingMaxTimeoutSeconds !== null) {
      return row.wordTrainingRecordingMaxTimeoutSeconds;
    }
    return this.parsePositiveInt(
      process.env.WORD_TRAINING_RECORDING_MAX_TIMEOUT_SECONDS,
      180,
      'WORD_TRAINING_RECORDING_MAX_TIMEOUT_SECONDS',
    );
  }

  async isDomainConversationTaskEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.domainConversationTaskEnabled;
  }

  async getDomainConversationMinDurationSeconds(): Promise<number> {
    const row = await this.getRow();
    if (row.domainConversationMinDurationSeconds !== null) {
      return row.domainConversationMinDurationSeconds;
    }
    return this.parsePositiveInt(
      process.env.DOMAIN_CONVERSATION_MIN_DURATION_SECONDS,
      15,
      'DOMAIN_CONVERSATION_MIN_DURATION_SECONDS',
    );
  }

  async getDomainConversationMaxDurationSeconds(): Promise<number> {
    const row = await this.getRow();
    if (row.domainConversationMaxDurationSeconds !== null) {
      return row.domainConversationMaxDurationSeconds;
    }
    return this.parsePositiveInt(
      process.env.DOMAIN_CONVERSATION_MAX_DURATION_SECONDS,
      60,
      'DOMAIN_CONVERSATION_MAX_DURATION_SECONDS',
    );
  }

  async getDomainConversationTaskTokenCost(): Promise<number> {
    const row = await this.getRow();
    if (row.domainConversationTaskTokenCost) {
      return row.domainConversationTaskTokenCost.toNumber();
    }
    const raw = process.env.DOMAIN_CONVERSATION_TASK_TOKEN_COST ?? '3.0';
    const cost = Number(raw);
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error(`Invalid DOMAIN_CONVERSATION_TASK_TOKEN_COST: ${raw}`);
    }
    return cost;
  }

  async isDomainConversationGenerationEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.domainConversationGenerationEnabled;
  }

  async getDomainConversationPromptsPerRun(): Promise<number> {
    const row = await this.getRow();
    return row.domainConversationPromptsPerRun;
  }

  async getDomainConversationMaxPromptPoolSize(): Promise<number> {
    const row = await this.getRow();
    return row.domainConversationMaxPromptPoolSize;
  }

  async getDomainConversationProviderOrder(): Promise<string> {
    const row = await this.getRow();
    return row.domainConversationProviderOrder;
  }

  async getDomainConversationQualityWeights(): Promise<{
    noise: number;
    quality: number;
    liveness: number;
  }> {
    const row = await this.getRow();
    return {
      noise: row.domainConversationQualityWeightNoise.toNumber(),
      quality: row.domainConversationQualityWeightQuality.toNumber(),
      liveness: row.domainConversationQualityWeightLiveness.toNumber(),
    };
  }

  async getDomainConversationMinQualityScoreForPayout(): Promise<number> {
    const row = await this.getRow();
    return row.domainConversationMinQualityScoreForPayout.toNumber();
  }

  async getForAdmin() {
    const row = await this.getRow();
    const referralCookiePersistSeconds =
      row.referralCookiePersistSeconds ??
      this.parsePositiveInt(
        process.env.REFERRAL_COOKIE_PERSIST_SECONDS,
        24 * 60 * 60,
        'REFERRAL_COOKIE_PERSIST_SECONDS',
      );
    const referralInviteExpirySeconds =
      row.referralInviteExpirySeconds ??
      this.parsePositiveInt(
        process.env.REFERRAL_INVITE_EXPIRY_SECONDS,
        24 * 60 * 60,
        'REFERRAL_INVITE_EXPIRY_SECONDS',
      );
    const wordTrainingRecordingTimeoutSeconds =
      row.wordTrainingRecordingTimeoutSeconds ??
      this.parsePositiveInt(
        process.env.WORD_TRAINING_RECORDING_TIMEOUT_SECONDS,
        5,
        'WORD_TRAINING_RECORDING_TIMEOUT_SECONDS',
      );
    const wordTrainingRecordingMaxTimeoutSeconds =
      row.wordTrainingRecordingMaxTimeoutSeconds ??
      this.parsePositiveInt(
        process.env.WORD_TRAINING_RECORDING_MAX_TIMEOUT_SECONDS,
        180,
        'WORD_TRAINING_RECORDING_MAX_TIMEOUT_SECONDS',
      );
    const domainConversationMinDurationSeconds =
      row.domainConversationMinDurationSeconds ??
      this.parsePositiveInt(
        process.env.DOMAIN_CONVERSATION_MIN_DURATION_SECONDS,
        15,
        'DOMAIN_CONVERSATION_MIN_DURATION_SECONDS',
      );
    const domainConversationMaxDurationSeconds =
      row.domainConversationMaxDurationSeconds ??
      this.parsePositiveInt(
        process.env.DOMAIN_CONVERSATION_MAX_DURATION_SECONDS,
        60,
        'DOMAIN_CONVERSATION_MAX_DURATION_SECONDS',
      );
    return {
      tokenUsdRate: row.tokenUsdRate?.toString() ?? null,
      minWithdrawalTokens: row.minWithdrawalTokens?.toString() ?? null,
      minWalletBalanceTokens: row.minWalletBalanceTokens.toString(),
      minCompletedTasksForWithdrawal: row.minCompletedTasksForWithdrawal ?? null,
      resendFromAddress: row.resendFromAddress,
      leadsNotificationAddress: row.leadsNotificationAddress,
      referralCookiePersistSeconds,
      referralInviteExpirySeconds,
      wordTrainingRecordingTimeoutSeconds,
      wordTrainingRecordingMaxTimeoutSeconds,
      trainingPayoutBonusCapMultiple: row.trainingPayoutBonusCapMultiple?.toString() ?? null,
      taskTokenCost: row.taskTokenCost?.toString() ?? null,
      reverseWordTrainingEnabled: row.reverseWordTrainingEnabled,
      wordTrainingEnabled: row.wordTrainingEnabled,
      sentenceTrainingEnabled: row.sentenceTrainingEnabled,
      domainConversationTaskEnabled: row.domainConversationTaskEnabled,
      domainConversationMinDurationSeconds,
      domainConversationMaxDurationSeconds,
      domainConversationTaskTokenCost: row.domainConversationTaskTokenCost?.toString() ?? null,
      domainConversationGenerationEnabled: row.domainConversationGenerationEnabled,
      domainConversationPromptsPerRun: row.domainConversationPromptsPerRun,
      domainConversationMaxPromptPoolSize: row.domainConversationMaxPromptPoolSize,
      domainConversationProviderOrder: row.domainConversationProviderOrder,
      domainConversationQualityWeightNoise: row.domainConversationQualityWeightNoise.toString(),
      domainConversationQualityWeightQuality: row.domainConversationQualityWeightQuality.toString(),
      domainConversationQualityWeightLiveness:
        row.domainConversationQualityWeightLiveness.toString(),
      domainConversationMinQualityScoreForPayout:
        row.domainConversationMinQualityScoreForPayout.toString(),
      adminPayoutOtpEnabled: row.adminPayoutOtpEnabled,
      sessionIdleTimeoutMinutes: row.sessionIdleTimeoutMinutes,
      sessionMaxHours: row.sessionMaxHours,
      phoneVerificationRequired: row.phoneVerificationRequired,
      manualPhoneVerificationEnabled: row.manualPhoneVerificationEnabled,
      manualPhoneVerificationFeeTokens: row.manualPhoneVerificationFeeTokens.toString(),
      manualPhoneVerificationWhatsappNumber: row.manualPhoneVerificationWhatsappNumber,
      manualPhoneVerificationExpiryMinutes: row.manualPhoneVerificationExpiryMinutes,
      startupBonusAmount: row.startupBonusAmount?.toString() ?? null,
      tawkToEnabled: row.tawkToEnabled,
      tawkToPropertyId: row.tawkToPropertyId,
      tawkToWidgetId: row.tawkToWidgetId,
      supportChatMode: row.supportChatMode,
      pwaInstallPromptEnabled: row.pwaInstallPromptEnabled,
      weeklyTrainerReportEnabled: row.weeklyTrainerReportEnabled,
      pwaInstallPromptReminderMinutes: row.pwaInstallPromptReminderMinutes,
      wordStuckTimeoutMinutes: row.wordStuckTimeoutMinutes,
      scoringSlaMinutes: row.scoringSlaMinutes,
      auditHoldEveryNSubmissions: row.auditHoldEveryNSubmissions,
      settlementDelayMinutes: row.settlementDelayMinutes,
      noFailOnTrainEnabled: row.noFailOnTrainEnabled,
      minScoreRange: row.minScoreRange.toString(),
      maxScoreRange: row.maxScoreRange.toString(),
      llmGenerationEnabled: row.llmGenerationEnabled,
      wordGenerationEnabled: row.wordGenerationEnabled,
      sentenceGenerationEnabled: row.sentenceGenerationEnabled,
      sentenceWordCount: row.sentenceWordCount,
      singleWordGenerationEnabled: row.singleWordGenerationEnabled,
      llmProviderOrder: row.llmProviderOrder,
      llmWordsPerItem: row.llmWordsPerItem,
      llmItemsPerRun: row.llmItemsPerRun,
      llmMaxTotalGeneratedItems: row.llmMaxTotalGeneratedItems,
      llmMaxSentenceGeneratedItems: row.llmMaxSentenceGeneratedItems,
      llmMaxPoolPerDialect: row.llmMaxPoolPerDialect,
      llmBackfillItemsPerDialectPerRun: row.llmBackfillItemsPerDialectPerRun,
      keyboardLayoutMaxLength: row.keyboardLayoutMaxLength,
      submissionRateLimitEnabled: row.submissionRateLimitEnabled,
      submissionRateLimitPerHour: row.submissionRateLimitPerHour,
      qracEnabled: row.qracEnabled,
      qracRequiredAtSessionStart: row.qracRequiredAtSessionStart,
      qracIntervalMinutes: row.qracIntervalMinutes,
      testimonyEnabled: row.testimonyEnabled,
      testimonyMaxTextLength: row.testimonyMaxTextLength,
      testimonyMaxVideoSeconds: row.testimonyMaxVideoSeconds,
      testimonyLandingLimit: row.testimonyLandingLimit,
      testimonyTextRewardTokens: row.testimonyTextRewardTokens.toString(),
      testimonyVideoRewardTokens: row.testimonyVideoRewardTokens.toString(),
      qualityGateEnabled: row.qualityGateEnabled,
      qualityWeightConsensus: row.qualityWeightConsensus.toString(),
      qualityWeightNoise: row.qualityWeightNoise.toString(),
      qualityWeightQuality: row.qualityWeightQuality.toString(),
      qualityWeightLiveness: row.qualityWeightLiveness.toString(),
      qualityWeightAsrMatch: row.qualityWeightAsrMatch.toString(),
      spellingNormalizationEnabled: row.spellingNormalizationEnabled,
      speechExpressionEnabled: row.speechExpressionEnabled,
      spellingNormalizationProviderOrder: row.spellingNormalizationProviderOrder,
      phraseEscalationEnabled: row.phraseEscalationEnabled,
      phraseTierGenerationEnabled: row.phraseTierGenerationEnabled,
      phraseTierItemsPerTierPerRun: row.phraseTierItemsPerTierPerRun,
      smsSenderId: row.smsSenderId,
      smsProviderOrder: row.smsProviderOrder,
      smslive247NativeOtpEnabled: row.smslive247NativeOtpEnabled,
      smsTransactionalOtpEnabled: row.smsTransactionalOtpEnabled,
      smsTransactionalProviderOrder: row.smsTransactionalProviderOrder,
      p2pSmsTradeCreatedEnabled: row.p2pSmsTradeCreatedEnabled,
      p2pSmsPaymentMarkedEnabled: row.p2pSmsPaymentMarkedEnabled,
      p2pSmsTokensReleasedEnabled: row.p2pSmsTokensReleasedEnabled,
      p2pSmsCancelledEnabled: row.p2pSmsCancelledEnabled,
      walletSmsWithdrawalPaidEnabled: row.walletSmsWithdrawalPaidEnabled,
      walletSmsWithdrawalRejectedEnabled: row.walletSmsWithdrawalRejectedEnabled,
      walletSmsWithdrawalFailedEnabled: row.walletSmsWithdrawalFailedEnabled,
      walletSmsDepositConfirmedEnabled: row.walletSmsDepositConfirmedEnabled,
      referralSmsFundingBonusEnabled: row.referralSmsFundingBonusEnabled,
      referralSmsPayoutBonusEnabled: row.referralSmsPayoutBonusEnabled,
      validationRewardPerRecording: row.validationRewardPerRecording.toString(),
      validatorDeckMaxItems: row.validatorDeckMaxItems,
      validatorL1ApprovalBonusPercent: row.validatorL1ApprovalBonusPercent.toString(),
      validatorL2ApprovalBonusPercent: row.validatorL2ApprovalBonusPercent.toString(),
      validatorL3ApprovalBonusPercent: row.validatorL3ApprovalBonusPercent.toString(),
      validatorReassignmentPenaltyPercent: row.validatorReassignmentPenaltyPercent.toString(),
      cryptoWithdrawalsEnabled: row.cryptoWithdrawalsEnabled,
      nowPaymentsPayoutsEnabled: row.nowPaymentsPayoutsEnabled,
      allowedWithdrawalCurrencies: row.allowedWithdrawalCurrencies,
      allowedWithdrawalNetworks: row.allowedWithdrawalNetworks,
      isFlutterwaveFundingEnabled: row.isFlutterwaveFundingEnabled,
      isFlutterwavePayoutsEnabled: row.isFlutterwavePayoutsEnabled,
      isFlutterwaveV4Enabled: row.isFlutterwaveV4Enabled,
      allowedFlutterwaveCurrencies: row.allowedFlutterwaveCurrencies,
      allowedFlutterwaveCountries: row.allowedFlutterwaveCountries,
      isStripePayoutsEnabled: row.isStripePayoutsEnabled,
      withdrawalFeeMode: row.withdrawalFeeMode,
      withdrawalFeeTokenAmount: row.withdrawalFeeTokenAmount.toString(),
      withdrawalFeePercent: row.withdrawalFeePercent.toString(),
      autoSubmitAfterApproval: row.autoSubmitAfterApproval,
      isKycRequiredForWithdrawals: row.isKycRequiredForWithdrawals,
      kycMinWithdrawalTokens: row.kycMinWithdrawalTokens.toString(),
      isKycRequiredOnboarding: row.isKycRequiredOnboarding,
      kycAutoCancelStaleEnabled: row.kycAutoCancelStaleEnabled,
      kycAutoCancelStaleMinutes: row.kycAutoCancelStaleMinutes,
      authMaintenanceEnabled: row.authMaintenanceEnabled,
      authMaintenanceUntil: row.authMaintenanceUntil,
      authMaintenanceMessage: row.authMaintenanceMessage,
      authMaintenanceBlockLogin: row.authMaintenanceBlockLogin,
      authMaintenanceBlockSignup: row.authMaintenanceBlockSignup,
      authMaintenanceBlockSessions: row.authMaintenanceBlockSessions,
      authMaintenanceExcludeAdmin: row.authMaintenanceExcludeAdmin,
      authMaintenanceExcludePartner: row.authMaintenanceExcludePartner,
      registerRateLimitPerHour:
        row.registerRateLimitPerHour ??
        this.parsePositiveInt(
          process.env.REGISTER_RATE_LIMIT_PER_HOUR,
          30,
          'REGISTER_RATE_LIMIT_PER_HOUR',
        ),
      landingShowCountries: row.landingShowCountries,
      landingShowDialects: row.landingShowDialects,
      landingShowTrainers: row.landingShowTrainers,
      landingShowPoolVolume: row.landingShowPoolVolume,
      landingShowPayout: row.landingShowPayout,
      streamSelfServeSignupEnabled: row.streamSelfServeSignupEnabled,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  async update(data: {
    tokenUsdRate?: number | null;
    minWithdrawalTokens?: number | null;
    minWalletBalanceTokens?: number;
    minCompletedTasksForWithdrawal?: number | null;
    resendFromAddress?: string | null;
    leadsNotificationAddress?: string | null;
    referralCookiePersistSeconds?: number;
    referralInviteExpirySeconds?: number;
    wordTrainingRecordingTimeoutSeconds?: number;
    wordTrainingRecordingMaxTimeoutSeconds?: number;
    trainingPayoutBonusCapMultiple?: number | null;
    taskTokenCost?: number | null;
    reverseWordTrainingEnabled?: boolean;
    wordTrainingEnabled?: boolean;
    sentenceTrainingEnabled?: boolean;
    domainConversationTaskEnabled?: boolean;
    domainConversationMinDurationSeconds?: number;
    domainConversationMaxDurationSeconds?: number;
    domainConversationTaskTokenCost?: number | null;
    domainConversationGenerationEnabled?: boolean;
    domainConversationPromptsPerRun?: number;
    domainConversationMaxPromptPoolSize?: number;
    domainConversationProviderOrder?: string;
    domainConversationQualityWeightNoise?: number;
    domainConversationQualityWeightQuality?: number;
    domainConversationQualityWeightLiveness?: number;
    domainConversationMinQualityScoreForPayout?: number;
    adminPayoutOtpEnabled?: boolean;
    sessionIdleTimeoutMinutes?: number;
    sessionMaxHours?: number;
    phoneVerificationRequired?: boolean;
    manualPhoneVerificationEnabled?: boolean;
    manualPhoneVerificationFeeTokens?: number;
    manualPhoneVerificationWhatsappNumber?: string;
    manualPhoneVerificationExpiryMinutes?: number;
    startupBonusAmount?: number | null;
    tawkToEnabled?: boolean;
    tawkToPropertyId?: string | null;
    tawkToWidgetId?: string | null;
    supportChatMode?: string;
    pwaInstallPromptEnabled?: boolean;
    pwaInstallPromptReminderMinutes?: number;
    weeklyTrainerReportEnabled?: boolean;
    wordStuckTimeoutMinutes?: number;
    scoringSlaMinutes?: number;
    auditHoldEveryNSubmissions?: number;
    settlementDelayMinutes?: number;
    noFailOnTrainEnabled?: boolean;
    minScoreRange?: number;
    maxScoreRange?: number;
    llmGenerationEnabled?: boolean;
    wordGenerationEnabled?: boolean;
    sentenceGenerationEnabled?: boolean;
    sentenceWordCount?: number;
    singleWordGenerationEnabled?: boolean;
    llmProviderOrder?: string;
    llmWordsPerItem?: number;
    llmItemsPerRun?: number;
    llmMaxTotalGeneratedItems?: number;
    llmMaxSentenceGeneratedItems?: number;
    llmMaxPoolPerDialect?: number;
    llmBackfillItemsPerDialectPerRun?: number;
    keyboardLayoutMaxLength?: number;
    submissionRateLimitEnabled?: boolean;
    submissionRateLimitPerHour?: number;
    qracEnabled?: boolean;
    qracRequiredAtSessionStart?: boolean;
    qracIntervalMinutes?: number;
    testimonyEnabled?: boolean;
    testimonyMaxTextLength?: number;
    testimonyMaxVideoSeconds?: number;
    testimonyLandingLimit?: number;
    testimonyTextRewardTokens?: number;
    testimonyVideoRewardTokens?: number;
    qualityGateEnabled?: boolean;
    qualityWeightConsensus?: number;
    qualityWeightNoise?: number;
    qualityWeightQuality?: number;
    qualityWeightLiveness?: number;
    qualityWeightAsrMatch?: number;
    spellingNormalizationEnabled?: boolean;
    speechExpressionEnabled?: boolean;
    spellingNormalizationProviderOrder?: string;
    phraseEscalationEnabled?: boolean;
    phraseTierGenerationEnabled?: boolean;
    phraseTierItemsPerTierPerRun?: number;
    smsSenderId?: string | null;
    smsProviderOrder?: string;
    smslive247NativeOtpEnabled?: boolean;
    smsTransactionalOtpEnabled?: boolean;
    smsTransactionalProviderOrder?: string;
    p2pSmsTradeCreatedEnabled?: boolean;
    p2pSmsPaymentMarkedEnabled?: boolean;
    p2pSmsTokensReleasedEnabled?: boolean;
    p2pSmsCancelledEnabled?: boolean;
    walletSmsWithdrawalPaidEnabled?: boolean;
    walletSmsWithdrawalRejectedEnabled?: boolean;
    walletSmsWithdrawalFailedEnabled?: boolean;
    walletSmsDepositConfirmedEnabled?: boolean;
    referralSmsFundingBonusEnabled?: boolean;
    referralSmsPayoutBonusEnabled?: boolean;
    validationRewardPerRecording?: number;
    validatorDeckMaxItems?: number;
    validatorL1ApprovalBonusPercent?: number;
    validatorL2ApprovalBonusPercent?: number;
    validatorL3ApprovalBonusPercent?: number;
    validatorReassignmentPenaltyPercent?: number;
    cryptoWithdrawalsEnabled?: boolean;
    nowPaymentsPayoutsEnabled?: boolean;
    allowedWithdrawalCurrencies?: string;
    allowedWithdrawalNetworks?: string;
    isFlutterwaveFundingEnabled?: boolean;
    isFlutterwavePayoutsEnabled?: boolean;
    isFlutterwaveV4Enabled?: boolean;
    allowedFlutterwaveCurrencies?: string;
    allowedFlutterwaveCountries?: string;
    isStripePayoutsEnabled?: boolean;
    withdrawalFeeMode?: string;
    withdrawalFeeTokenAmount?: number;
    withdrawalFeePercent?: number;
    autoSubmitAfterApproval?: boolean;
    isKycRequiredForWithdrawals?: boolean;
    kycMinWithdrawalTokens?: number;
    isKycRequiredOnboarding?: boolean;
    kycAutoCancelStaleEnabled?: boolean;
    kycAutoCancelStaleMinutes?: number;
    authMaintenanceEnabled?: boolean;
    authMaintenanceUntil?: Date | null;
    authMaintenanceMessage?: string | null;
    authMaintenanceBlockLogin?: boolean;
    authMaintenanceBlockSignup?: boolean;
    authMaintenanceBlockSessions?: boolean;
    authMaintenanceExcludeAdmin?: boolean;
    authMaintenanceExcludePartner?: boolean;
    registerRateLimitPerHour?: number | null;
    landingShowCountries?: boolean;
    landingShowDialects?: boolean;
    landingShowTrainers?: boolean;
    landingShowPoolVolume?: boolean;
    landingShowPayout?: boolean;
    streamSelfServeSignupEnabled?: boolean;
  }) {
    if (data.authMaintenanceEnabled) {
      // Turning it on (or extending it) always needs a concrete end time --
      // an admin flipping this switch is expected to say when it ends, per
      // the countdown shown on the login/signup pages. authMaintenanceUntil
      // is read from the existing row when the caller only patches the
      // message/flag without resending the timestamp.
      const existing = await this.getRow();
      const until =
        data.authMaintenanceUntil !== undefined
          ? data.authMaintenanceUntil
          : existing.authMaintenanceUntil;
      if (!until || until.getTime() <= Date.now()) {
        throw new BadRequestException(
          'authMaintenanceUntil must be a future date/time when enabling maintenance mode',
        );
      }
      const blockLogin = data.authMaintenanceBlockLogin ?? existing.authMaintenanceBlockLogin;
      const blockSignup = data.authMaintenanceBlockSignup ?? existing.authMaintenanceBlockSignup;
      const blockSessions =
        data.authMaintenanceBlockSessions ?? existing.authMaintenanceBlockSessions;
      if (!blockLogin && !blockSignup && !blockSessions) {
        throw new BadRequestException(
          'Select at least one of login, signup, or sessions to block when enabling maintenance mode',
        );
      }
    }
    if (data.llmProviderOrder) {
      const tokens = data.llmProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === LLM_PROVIDER_KEYS.length &&
        LLM_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === LLM_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException(
          'llmProviderOrder must list openai, deepseek, and anthropic exactly once each',
        );
      }
    }

    if (data.supportChatMode && !['NONE', 'TAWK', 'AI'].includes(data.supportChatMode)) {
      throw new BadRequestException('supportChatMode must be NONE, TAWK, or AI');
    }

    if (data.spellingNormalizationProviderOrder) {
      const tokens = data.spellingNormalizationProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === LLM_PROVIDER_KEYS.length &&
        LLM_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === LLM_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException(
          'spellingNormalizationProviderOrder must list openai, deepseek, and anthropic exactly once each',
        );
      }
    }

    if (data.smsProviderOrder) {
      const tokens = data.smsProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === SMS_PROVIDER_KEYS.length &&
        SMS_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === SMS_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException(
          'smsProviderOrder must list termii, twilio, and africastalking exactly once each',
        );
      }
    }

    if (data.domainConversationProviderOrder) {
      const tokens = data.domainConversationProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === LLM_PROVIDER_KEYS.length &&
        LLM_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === LLM_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException(
          'domainConversationProviderOrder must list openai, deepseek, and anthropic exactly once each',
        );
      }
    }

    if (
      data.domainConversationMinDurationSeconds !== undefined ||
      data.domainConversationMaxDurationSeconds !== undefined
    ) {
      const existing = await this.getRow();
      const min =
        data.domainConversationMinDurationSeconds ??
        existing.domainConversationMinDurationSeconds ??
        this.parsePositiveInt(
          process.env.DOMAIN_CONVERSATION_MIN_DURATION_SECONDS,
          15,
          'DOMAIN_CONVERSATION_MIN_DURATION_SECONDS',
        );
      const max =
        data.domainConversationMaxDurationSeconds ??
        existing.domainConversationMaxDurationSeconds ??
        this.parsePositiveInt(
          process.env.DOMAIN_CONVERSATION_MAX_DURATION_SECONDS,
          60,
          'DOMAIN_CONVERSATION_MAX_DURATION_SECONDS',
        );
      if (min >= max) {
        throw new BadRequestException(
          'domainConversationMinDurationSeconds must be less than domainConversationMaxDurationSeconds',
        );
      }
    }

    const anyDomainConversationWeightProvided =
      data.domainConversationQualityWeightNoise !== undefined ||
      data.domainConversationQualityWeightQuality !== undefined ||
      data.domainConversationQualityWeightLiveness !== undefined;
    if (anyDomainConversationWeightProvided) {
      const existing = await this.getRow();
      const noise =
        data.domainConversationQualityWeightNoise ??
        existing.domainConversationQualityWeightNoise.toNumber();
      const quality =
        data.domainConversationQualityWeightQuality ??
        existing.domainConversationQualityWeightQuality.toNumber();
      const liveness =
        data.domainConversationQualityWeightLiveness ??
        existing.domainConversationQualityWeightLiveness.toNumber();
      const sum = noise + quality + liveness;
      if (Math.abs(sum - 100) > 0.01) {
        throw new BadRequestException(
          'domainConversationQualityWeightNoise/Quality/Liveness must sum to 100',
        );
      }
    }

    if (data.smsTransactionalProviderOrder) {
      const tokens = data.smsTransactionalProviderOrder.split(',');
      const isValidPermutation =
        tokens.length === SMS_TRANSACTIONAL_PROVIDER_KEYS.length &&
        SMS_TRANSACTIONAL_PROVIDER_KEYS.every((key) => tokens.includes(key)) &&
        new Set(tokens).size === SMS_TRANSACTIONAL_PROVIDER_KEYS.length;
      if (!isValidPermutation) {
        throw new BadRequestException(
          'smsTransactionalProviderOrder must list termii, twilio, africastalking, and smslive247 exactly once each',
        );
      }
    }

    const SUPPORTED_WITHDRAWAL_CURRENCIES = ['USDT', 'USDC'];
    const SUPPORTED_WITHDRAWAL_NETWORKS = ['TRC20', 'ERC20', 'BEP20', 'SOL', 'POLYGON'];

    if (data.allowedWithdrawalCurrencies) {
      const tokens = data.allowedWithdrawalCurrencies.split(',').map((v) => v.trim().toUpperCase());
      if (
        tokens.length === 0 ||
        !tokens.every((t) => SUPPORTED_WITHDRAWAL_CURRENCIES.includes(t))
      ) {
        throw new BadRequestException(
          `allowedWithdrawalCurrencies must be a non-empty CSV subset of ${SUPPORTED_WITHDRAWAL_CURRENCIES.join(', ')}`,
        );
      }
    }

    if (data.allowedWithdrawalNetworks) {
      const tokens = data.allowedWithdrawalNetworks.split(',').map((v) => v.trim().toUpperCase());
      if (tokens.length === 0 || !tokens.every((t) => SUPPORTED_WITHDRAWAL_NETWORKS.includes(t))) {
        throw new BadRequestException(
          `allowedWithdrawalNetworks must be a non-empty CSV subset of ${SUPPORTED_WITHDRAWAL_NETWORKS.join(', ')}`,
        );
      }
    }

    if (data.withdrawalFeeMode && !['platform', 'user'].includes(data.withdrawalFeeMode)) {
      throw new BadRequestException('withdrawalFeeMode must be "platform" or "user"');
    }

    if (data.allowedFlutterwaveCurrencies !== undefined) {
      const tokens = data.allowedFlutterwaveCurrencies
        .split(',')
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean);
      if (tokens.length === 0 || !tokens.every((t) => /^[A-Z]{3}$/.test(t))) {
        throw new BadRequestException(
          'allowedFlutterwaveCurrencies must be a non-empty CSV of 3-letter ISO 4217 currency codes',
        );
      }
    }

    if (data.allowedFlutterwaveCountries !== undefined) {
      const tokens = data.allowedFlutterwaveCountries
        .split(',')
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean);
      if (tokens.length === 0 || !tokens.every((t) => /^[A-Z]{2}$/.test(t))) {
        throw new BadRequestException(
          'allowedFlutterwaveCountries must be a non-empty CSV of 2-letter ISO 3166-1 alpha-2 country codes',
        );
      }
    }

    if (data.manualPhoneVerificationWhatsappNumber !== undefined) {
      data.manualPhoneVerificationWhatsappNumber =
        data.manualPhoneVerificationWhatsappNumber.trim();
    }
    if (data.manualPhoneVerificationEnabled && data.manualPhoneVerificationWhatsappNumber === '') {
      throw new BadRequestException(
        'manualPhoneVerificationWhatsappNumber is required when manual verification is enabled',
      );
    }

    if (data.smsSenderId !== undefined) {
      const trimmed = data.smsSenderId?.trim() ?? null;
      data.smsSenderId = trimmed === '' ? null : trimmed;
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
        throw new BadRequestException(
          'qualityWeightConsensus/Noise/Quality/Liveness must sum to 100',
        );
      }
    }

    // qualityWeightAsrMatch is deliberately NOT part of the sum-to-100 group
    // above -- it's WordRecording-only, additive/opt-in (default 0), not a
    // slice carved out of the other four's budget (see
    // computeWordRecordingCompositeScore's doc comment). Only needs its own
    // non-negative check.
    if (data.qualityWeightAsrMatch !== undefined && data.qualityWeightAsrMatch < 0) {
      throw new BadRequestException('qualityWeightAsrMatch must be >= 0');
    }

    // 0 is the explicit "no reserve" value (default) -- only negative values
    // are actually invalid.
    if (data.minWalletBalanceTokens !== undefined && data.minWalletBalanceTokens < 0) {
      throw new BadRequestException('minWalletBalanceTokens must be >= 0');
    }

    // 0 is the explicit "feature off" value (see schema doc comment) --
    // only negative values are actually invalid.
    if (data.auditHoldEveryNSubmissions !== undefined && data.auditHoldEveryNSubmissions < 0) {
      throw new BadRequestException('auditHoldEveryNSubmissions must be >= 0');
    }

    // 0 is the explicit "off" value for both (see schema doc comments).
    if (
      data.validationRewardPerRecording !== undefined &&
      data.validationRewardPerRecording < 0
    ) {
      throw new BadRequestException('validationRewardPerRecording must be >= 0');
    }
    if (data.validatorDeckMaxItems !== undefined && data.validatorDeckMaxItems < 0) {
      throw new BadRequestException('validatorDeckMaxItems must be >= 0');
    }

    // Every approval-bonus/reassignment-penalty field is a percent -- 0 is a
    // valid "no bonus"/"no penalty" value, only out-of-range values are invalid.
    for (const [key, value] of [
      ['validatorL1ApprovalBonusPercent', data.validatorL1ApprovalBonusPercent],
      ['validatorL2ApprovalBonusPercent', data.validatorL2ApprovalBonusPercent],
      ['validatorL3ApprovalBonusPercent', data.validatorL3ApprovalBonusPercent],
      ['validatorReassignmentPenaltyPercent', data.validatorReassignmentPenaltyPercent],
    ] as const) {
      if (value !== undefined && (value < 0 || value > 100)) {
        throw new BadRequestException(`${key} must be between 0 and 100`);
      }
    }

    // No "off" value for either -- unlike auditHoldEveryNSubmissions, a
    // session timeout has no meaningful "disabled" state (0 would mean
    // instant logout, not "never time out"). Both must stay strictly
    // positive; the frontend session logic assumes a real, positive minutes/
    // hours value to compare against.
    if (data.sessionIdleTimeoutMinutes !== undefined && data.sessionIdleTimeoutMinutes < 1) {
      throw new BadRequestException('sessionIdleTimeoutMinutes must be >= 1');
    }
    if (data.sessionMaxHours !== undefined && data.sessionMaxHours < 1) {
      throw new BadRequestException('sessionMaxHours must be >= 1');
    }

    // wordTrainingEnabled/sentenceTrainingEnabled/reverseWordTrainingEnabled
    // may ALL be turned off at once -- no validation guard here. When both
    // ENGLISH_TO_DIALECT content gates are off, WordsService.nextAssignment
    // always serves DIALECT_TO_ENGLISH reverse-validation instead (as long
    // as reverseWordTrainingEnabled is on); only when all three are off does
    // a trainer see NO_WORDS_AVAILABLE, which is the intended terminal state
    // for that admin configuration, not an error to prevent.

    const row = await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    this.cachedRow = row;
    this.cachedAt = Date.now();
    const referralCookiePersistSeconds =
      row.referralCookiePersistSeconds ??
      this.parsePositiveInt(
        process.env.REFERRAL_COOKIE_PERSIST_SECONDS,
        24 * 60 * 60,
        'REFERRAL_COOKIE_PERSIST_SECONDS',
      );
    const referralInviteExpirySeconds =
      row.referralInviteExpirySeconds ??
      this.parsePositiveInt(
        process.env.REFERRAL_INVITE_EXPIRY_SECONDS,
        24 * 60 * 60,
        'REFERRAL_INVITE_EXPIRY_SECONDS',
      );
    const wordTrainingRecordingTimeoutSeconds =
      row.wordTrainingRecordingTimeoutSeconds ??
      this.parsePositiveInt(
        process.env.WORD_TRAINING_RECORDING_TIMEOUT_SECONDS,
        5,
        'WORD_TRAINING_RECORDING_TIMEOUT_SECONDS',
      );
    const wordTrainingRecordingMaxTimeoutSeconds =
      row.wordTrainingRecordingMaxTimeoutSeconds ??
      this.parsePositiveInt(
        process.env.WORD_TRAINING_RECORDING_MAX_TIMEOUT_SECONDS,
        180,
        'WORD_TRAINING_RECORDING_MAX_TIMEOUT_SECONDS',
      );
    const domainConversationMinDurationSeconds =
      row.domainConversationMinDurationSeconds ??
      this.parsePositiveInt(
        process.env.DOMAIN_CONVERSATION_MIN_DURATION_SECONDS,
        15,
        'DOMAIN_CONVERSATION_MIN_DURATION_SECONDS',
      );
    const domainConversationMaxDurationSeconds =
      row.domainConversationMaxDurationSeconds ??
      this.parsePositiveInt(
        process.env.DOMAIN_CONVERSATION_MAX_DURATION_SECONDS,
        60,
        'DOMAIN_CONVERSATION_MAX_DURATION_SECONDS',
      );
    return {
      tokenUsdRate: row.tokenUsdRate?.toString() ?? null,
      minWithdrawalTokens: row.minWithdrawalTokens?.toString() ?? null,
      minWalletBalanceTokens: row.minWalletBalanceTokens.toString(),
      minCompletedTasksForWithdrawal: row.minCompletedTasksForWithdrawal ?? null,
      resendFromAddress: row.resendFromAddress,
      leadsNotificationAddress: row.leadsNotificationAddress,
      referralCookiePersistSeconds,
      referralInviteExpirySeconds,
      wordTrainingRecordingTimeoutSeconds,
      wordTrainingRecordingMaxTimeoutSeconds,
      trainingPayoutBonusCapMultiple: row.trainingPayoutBonusCapMultiple?.toString() ?? null,
      taskTokenCost: row.taskTokenCost?.toString() ?? null,
      reverseWordTrainingEnabled: row.reverseWordTrainingEnabled,
      wordTrainingEnabled: row.wordTrainingEnabled,
      sentenceTrainingEnabled: row.sentenceTrainingEnabled,
      domainConversationTaskEnabled: row.domainConversationTaskEnabled,
      domainConversationMinDurationSeconds,
      domainConversationMaxDurationSeconds,
      domainConversationTaskTokenCost: row.domainConversationTaskTokenCost?.toString() ?? null,
      domainConversationGenerationEnabled: row.domainConversationGenerationEnabled,
      domainConversationPromptsPerRun: row.domainConversationPromptsPerRun,
      domainConversationMaxPromptPoolSize: row.domainConversationMaxPromptPoolSize,
      domainConversationProviderOrder: row.domainConversationProviderOrder,
      domainConversationQualityWeightNoise: row.domainConversationQualityWeightNoise.toString(),
      domainConversationQualityWeightQuality: row.domainConversationQualityWeightQuality.toString(),
      domainConversationQualityWeightLiveness:
        row.domainConversationQualityWeightLiveness.toString(),
      domainConversationMinQualityScoreForPayout:
        row.domainConversationMinQualityScoreForPayout.toString(),
      adminPayoutOtpEnabled: row.adminPayoutOtpEnabled,
      sessionIdleTimeoutMinutes: row.sessionIdleTimeoutMinutes,
      sessionMaxHours: row.sessionMaxHours,
      phoneVerificationRequired: row.phoneVerificationRequired,
      manualPhoneVerificationEnabled: row.manualPhoneVerificationEnabled,
      manualPhoneVerificationFeeTokens: row.manualPhoneVerificationFeeTokens.toString(),
      manualPhoneVerificationWhatsappNumber: row.manualPhoneVerificationWhatsappNumber,
      manualPhoneVerificationExpiryMinutes: row.manualPhoneVerificationExpiryMinutes,
      startupBonusAmount: row.startupBonusAmount?.toString() ?? null,
      tawkToEnabled: row.tawkToEnabled,
      tawkToPropertyId: row.tawkToPropertyId,
      tawkToWidgetId: row.tawkToWidgetId,
      supportChatMode: row.supportChatMode,
      wordStuckTimeoutMinutes: row.wordStuckTimeoutMinutes,
      scoringSlaMinutes: row.scoringSlaMinutes,
      auditHoldEveryNSubmissions: row.auditHoldEveryNSubmissions,
      settlementDelayMinutes: row.settlementDelayMinutes,
      noFailOnTrainEnabled: row.noFailOnTrainEnabled,
      minScoreRange: row.minScoreRange.toString(),
      maxScoreRange: row.maxScoreRange.toString(),
      llmGenerationEnabled: row.llmGenerationEnabled,
      wordGenerationEnabled: row.wordGenerationEnabled,
      sentenceGenerationEnabled: row.sentenceGenerationEnabled,
      sentenceWordCount: row.sentenceWordCount,
      singleWordGenerationEnabled: row.singleWordGenerationEnabled,
      llmProviderOrder: row.llmProviderOrder,
      llmWordsPerItem: row.llmWordsPerItem,
      llmItemsPerRun: row.llmItemsPerRun,
      llmMaxTotalGeneratedItems: row.llmMaxTotalGeneratedItems,
      llmMaxSentenceGeneratedItems: row.llmMaxSentenceGeneratedItems,
      llmMaxPoolPerDialect: row.llmMaxPoolPerDialect,
      llmBackfillItemsPerDialectPerRun: row.llmBackfillItemsPerDialectPerRun,
      keyboardLayoutMaxLength: row.keyboardLayoutMaxLength,
      submissionRateLimitEnabled: row.submissionRateLimitEnabled,
      submissionRateLimitPerHour: row.submissionRateLimitPerHour,
      qracEnabled: row.qracEnabled,
      qracRequiredAtSessionStart: row.qracRequiredAtSessionStart,
      qracIntervalMinutes: row.qracIntervalMinutes,
      testimonyEnabled: row.testimonyEnabled,
      testimonyMaxTextLength: row.testimonyMaxTextLength,
      testimonyMaxVideoSeconds: row.testimonyMaxVideoSeconds,
      testimonyLandingLimit: row.testimonyLandingLimit,
      testimonyTextRewardTokens: row.testimonyTextRewardTokens.toString(),
      testimonyVideoRewardTokens: row.testimonyVideoRewardTokens.toString(),
      qualityGateEnabled: row.qualityGateEnabled,
      qualityWeightConsensus: row.qualityWeightConsensus.toString(),
      qualityWeightNoise: row.qualityWeightNoise.toString(),
      qualityWeightQuality: row.qualityWeightQuality.toString(),
      qualityWeightLiveness: row.qualityWeightLiveness.toString(),
      qualityWeightAsrMatch: row.qualityWeightAsrMatch.toString(),
      spellingNormalizationEnabled: row.spellingNormalizationEnabled,
      speechExpressionEnabled: row.speechExpressionEnabled,
      spellingNormalizationProviderOrder: row.spellingNormalizationProviderOrder,
      phraseEscalationEnabled: row.phraseEscalationEnabled,
      phraseTierGenerationEnabled: row.phraseTierGenerationEnabled,
      phraseTierItemsPerTierPerRun: row.phraseTierItemsPerTierPerRun,
      smsSenderId: row.smsSenderId,
      smsProviderOrder: row.smsProviderOrder,
      smslive247NativeOtpEnabled: row.smslive247NativeOtpEnabled,
      smsTransactionalOtpEnabled: row.smsTransactionalOtpEnabled,
      smsTransactionalProviderOrder: row.smsTransactionalProviderOrder,
      p2pSmsTradeCreatedEnabled: row.p2pSmsTradeCreatedEnabled,
      p2pSmsPaymentMarkedEnabled: row.p2pSmsPaymentMarkedEnabled,
      p2pSmsTokensReleasedEnabled: row.p2pSmsTokensReleasedEnabled,
      p2pSmsCancelledEnabled: row.p2pSmsCancelledEnabled,
      walletSmsWithdrawalPaidEnabled: row.walletSmsWithdrawalPaidEnabled,
      walletSmsWithdrawalRejectedEnabled: row.walletSmsWithdrawalRejectedEnabled,
      walletSmsWithdrawalFailedEnabled: row.walletSmsWithdrawalFailedEnabled,
      walletSmsDepositConfirmedEnabled: row.walletSmsDepositConfirmedEnabled,
      referralSmsFundingBonusEnabled: row.referralSmsFundingBonusEnabled,
      referralSmsPayoutBonusEnabled: row.referralSmsPayoutBonusEnabled,
      validationRewardPerRecording: row.validationRewardPerRecording.toString(),
      validatorDeckMaxItems: row.validatorDeckMaxItems,
      validatorL1ApprovalBonusPercent: row.validatorL1ApprovalBonusPercent.toString(),
      validatorL2ApprovalBonusPercent: row.validatorL2ApprovalBonusPercent.toString(),
      validatorL3ApprovalBonusPercent: row.validatorL3ApprovalBonusPercent.toString(),
      validatorReassignmentPenaltyPercent: row.validatorReassignmentPenaltyPercent.toString(),
      cryptoWithdrawalsEnabled: row.cryptoWithdrawalsEnabled,
      nowPaymentsPayoutsEnabled: row.nowPaymentsPayoutsEnabled,
      allowedWithdrawalCurrencies: row.allowedWithdrawalCurrencies,
      allowedWithdrawalNetworks: row.allowedWithdrawalNetworks,
      isFlutterwaveFundingEnabled: row.isFlutterwaveFundingEnabled,
      isFlutterwavePayoutsEnabled: row.isFlutterwavePayoutsEnabled,
      isFlutterwaveV4Enabled: row.isFlutterwaveV4Enabled,
      allowedFlutterwaveCurrencies: row.allowedFlutterwaveCurrencies,
      allowedFlutterwaveCountries: row.allowedFlutterwaveCountries,
      isStripePayoutsEnabled: row.isStripePayoutsEnabled,
      withdrawalFeeMode: row.withdrawalFeeMode,
      withdrawalFeeTokenAmount: row.withdrawalFeeTokenAmount.toString(),
      withdrawalFeePercent: row.withdrawalFeePercent.toString(),
      autoSubmitAfterApproval: row.autoSubmitAfterApproval,
      isKycRequiredForWithdrawals: row.isKycRequiredForWithdrawals,
      kycMinWithdrawalTokens: row.kycMinWithdrawalTokens.toString(),
      isKycRequiredOnboarding: row.isKycRequiredOnboarding,
      kycAutoCancelStaleEnabled: row.kycAutoCancelStaleEnabled,
      kycAutoCancelStaleMinutes: row.kycAutoCancelStaleMinutes,
      authMaintenanceEnabled: row.authMaintenanceEnabled,
      authMaintenanceUntil: row.authMaintenanceUntil,
      authMaintenanceMessage: row.authMaintenanceMessage,
      authMaintenanceBlockLogin: row.authMaintenanceBlockLogin,
      authMaintenanceBlockSignup: row.authMaintenanceBlockSignup,
      authMaintenanceBlockSessions: row.authMaintenanceBlockSessions,
      authMaintenanceExcludeAdmin: row.authMaintenanceExcludeAdmin,
      authMaintenanceExcludePartner: row.authMaintenanceExcludePartner,
      registerRateLimitPerHour:
        row.registerRateLimitPerHour ??
        this.parsePositiveInt(
          process.env.REGISTER_RATE_LIMIT_PER_HOUR,
          30,
          'REGISTER_RATE_LIMIT_PER_HOUR',
        ),
      landingShowCountries: row.landingShowCountries,
      landingShowDialects: row.landingShowDialects,
      landingShowTrainers: row.landingShowTrainers,
      landingShowPoolVolume: row.landingShowPoolVolume,
      landingShowPayout: row.landingShowPayout,
      streamSelfServeSignupEnabled: row.streamSelfServeSignupEnabled,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  async isStreamSelfServeSignupEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return row.streamSelfServeSignupEnabled;
  }

  async getPublicClientSettings() {
    const row = await this.getRow();
    const [
      referralCookiePersistSeconds,
      referralInviteExpirySeconds,
      wordTrainingRecordingTimeoutSeconds,
      wordTrainingRecordingMaxTimeoutSeconds,
      authMaintenance,
      tawkTo,
      supportChat,
      manualPhone,
      phoneVerificationRequired,
      isKycRequiredForWithdrawals,
      kycMinWithdrawalTokens,
      isKycRequiredOnboarding,
      isFlutterwaveV4Enabled,
      isFlutterwavePayoutsEnabled,
      isStripePayoutsEnabled,
      isCryptoWithdrawalsEnabled,
    ] = await Promise.all([
      this.getReferralCookiePersistSeconds(),
      this.getReferralInviteExpirySeconds(),
      this.getWordTrainingRecordingTimeoutSeconds(),
      this.getWordTrainingRecordingMaxTimeoutSeconds(),
      this.getAuthMaintenanceStatus(),
      this.getTawkToWidget(),
      this.getSupportChatSettings(),
      this.getManualPhoneVerificationSettings(),
      this.isPhoneVerificationRequired(),
      this.isKycRequiredForWithdrawals(),
      this.getKycMinWithdrawalTokens(),
      this.isKycRequiredOnboarding(),
      this.isFlutterwaveV4Enabled(),
      this.isFlutterwavePayoutsEnabled(),
      this.isStripePayoutsEnabled(),
      this.isCryptoWithdrawalsEnabled(),
    ]);
    return {
      referralCookiePersistSeconds,
      referralInviteExpirySeconds,
      wordTrainingRecordingTimeoutSeconds,
      wordTrainingRecordingMaxTimeoutSeconds,
      domainConversationTaskEnabled: row.domainConversationTaskEnabled,
      sessionIdleTimeoutMinutes: row.sessionIdleTimeoutMinutes,
      sessionMaxHours: row.sessionMaxHours,
      phoneVerificationRequired,
      manualPhoneVerificationEnabled: manualPhone.enabled,
      manualPhoneVerificationFeeTokens: manualPhone.feeTokens.toString(),
      manualPhoneVerificationWhatsappNumber: manualPhone.whatsappNumber,
      manualPhoneVerificationExpiryMinutes: manualPhone.expiryMinutes,
      // Login page shows the notice if either login or signup is blocked
      // (magic-link request is a signup path -- see requestMagicLink);
      // register page shows it only if signup is blocked, so both are
      // surfaced and the frontend picks the one relevant to the page it's on.
      authMaintenanceEnabled:
        authMaintenance.enabled && (authMaintenance.blockLogin || authMaintenance.blockSignup),
      authMaintenanceBlocksLogin: authMaintenance.enabled && authMaintenance.blockLogin,
      authMaintenanceBlocksSignup: authMaintenance.enabled && authMaintenance.blockSignup,
      authMaintenanceUntil: authMaintenance.until,
      authMaintenanceMessage: authMaintenance.message,
      tawkToEnabled: tawkTo.enabled,
      tawkToPropertyId: tawkTo.propertyId,
      tawkToWidgetId: tawkTo.widgetId,
      supportChatMode: supportChat.mode,
      pwaInstallPromptEnabled: row.pwaInstallPromptEnabled,
      weeklyTrainerReportEnabled: row.weeklyTrainerReportEnabled,
      pwaInstallPromptReminderMinutes: row.pwaInstallPromptReminderMinutes,
      isKycRequiredForWithdrawals,
      kycMinWithdrawalTokens: kycMinWithdrawalTokens.toString(),
      isKycRequiredOnboarding,
      isFlutterwaveV4Enabled,
      // Trainer-facing "which payout rail can I use" gates -- unlike the
      // config CSVs (allowedFlutterwaveCurrencies/Countries) which are only
      // needed by the admin settings UI, these are the only pieces of that
      // config a trainer's payout-accounts page actually needs to decide
      // which "add payout method" options to show. allowedWithdrawalCurrencies/
      // Networks ARE exposed here (unlike the Flutterwave CSVs) because the
      // stablecoin wallet setup form needs to offer exactly the
      // asset/network combinations the backend will actually accept --
      // showing an option here that the backend then rejects would be a
      // trainer-facing bug, not just a missing admin-UI nicety.
      isFlutterwavePayoutsEnabled,
      isStripePayoutsEnabled,
      isCryptoWithdrawalsEnabled,
      allowedWithdrawalCurrencies: row.allowedWithdrawalCurrencies,
      allowedWithdrawalNetworks: row.allowedWithdrawalNetworks,
      testimonyEnabled: row.testimonyEnabled,
      testimonyMaxTextLength: row.testimonyMaxTextLength,
      testimonyMaxVideoSeconds: row.testimonyMaxVideoSeconds,
      testimonyLandingLimit: row.testimonyLandingLimit,
      testimonyTextRewardTokens: row.testimonyTextRewardTokens.toString(),
      testimonyVideoRewardTokens: row.testimonyVideoRewardTokens.toString(),
    };
  }

  /**
   * Small, Stream-specific public settings surface -- separate from
   * getPublicClientSettings() (the trainer-platform landing/login/signup
   * bundle) rather than folding this in, since Stream's public frontend has
   * no reason to fetch or depend on that much larger, trainer-facing shape.
   */
  async getStreamPublicClientSettings() {
    return {
      selfServeSignupEnabled: await this.isStreamSelfServeSignupEnabled(),
    };
  }
}
