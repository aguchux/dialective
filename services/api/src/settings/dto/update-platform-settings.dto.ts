import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

/** Accepts either a bare email ("noreply@x.com") or a display-name form ("Dialect Library" <noreply@x.com>) -- both are valid Resend "from" values. */
@ValidatorConstraint({ name: 'isEmailOrNamedEmail', async: false })
class IsEmailOrNamedEmailConstraint implements ValidatorConstraintInterface {
  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static readonly NAMED_RE = /^"?([^"<]{1,200}?)"?\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>$/;

  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return (
      IsEmailOrNamedEmailConstraint.EMAIL_RE.test(trimmed) ||
      IsEmailOrNamedEmailConstraint.NAMED_RE.test(trimmed)
    );
  }

  defaultMessage(): string {
    return 'Must be an email address, or "Display Name" <email@address.com>';
  }
}

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsPositive()
  tokenUsdRate?: number;

  @IsOptional()
  @IsPositive()
  minWithdrawalTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minWalletBalanceTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minCompletedTasksForWithdrawal?: number;

  @IsOptional()
  @IsString()
  @Validate(IsEmailOrNamedEmailConstraint)
  resendFromAddress?: string;

  @IsOptional()
  @IsEmail()
  leadsNotificationAddress?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  referralCookiePersistSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  referralInviteExpirySeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  wordTrainingRecordingTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1800)
  wordTrainingRecordingMaxTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  dictationRecordingTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1800)
  dictationRecordingMaxTimeoutSeconds?: number;

  @IsOptional()
  @IsPositive()
  trainingPayoutBonusCapMultiple?: number;

  @IsOptional()
  @IsPositive()
  taskTokenCost?: number;

  @IsOptional()
  @IsBoolean()
  reverseWordTrainingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  wordTrainingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sentenceTrainingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  adminPayoutOtpEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  phoneVerificationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  manualPhoneVerificationEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  manualPhoneVerificationFeeTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  manualPhoneVerificationWhatsappNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  manualPhoneVerificationExpiryMinutes?: number;

  // One-time DL amount credited the first time a user verifies their email.
  // 0 (or omitted, leaving it null) means the bonus is off.
  @IsOptional()
  @IsNumber()
  @Min(0)
  startupBonusAmount?: number;

  @IsOptional()
  @IsBoolean()
  tawkToEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tawkToPropertyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tawkToWidgetId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(NONE|TAWK|AI)$/)
  supportChatMode?: string;

  @IsOptional()
  @IsBoolean()
  pwaInstallPromptEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(10080)
  pwaInstallPromptReminderMinutes?: number;

  @IsOptional()
  @IsBoolean()
  weeklyTrainerReportEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  wordStuckTimeoutMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  scoringSlaMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  auditHoldEveryNSubmissions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  settlementDelayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  noFailOnTrainEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minScoreRange?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxScoreRange?: number;

  @IsOptional()
  @IsBoolean()
  llmGenerationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  singleWordGenerationEnabled?: boolean;

  // 3 comma-separated tokens from {openai,deepseek,anthropic}; exact
  // permutation (all 3 distinct, no repeats/omissions) is validated in
  // PlatformSettingsService.update, not expressible via a single regex.
  @IsOptional()
  @IsString()
  @Matches(/^(openai|deepseek|anthropic),(openai|deepseek|anthropic),(openai|deepseek|anthropic)$/)
  llmProviderOrder?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  llmWordsPerItem?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  llmItemsPerRun?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  llmMaxTotalGeneratedItems?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  llmMaxPoolPerDialect?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  llmBackfillItemsPerDialectPerRun?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  keyboardLayoutMaxLength?: number;

  @IsOptional()
  @IsBoolean()
  submissionRateLimitEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  submissionRateLimitPerHour?: number;

  @IsOptional()
  @IsBoolean()
  qracEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  qracRequiredAtSessionStart?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  qracIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  testimonyEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  testimonyMaxTextLength?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  testimonyMaxVideoSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  testimonyLandingLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  testimonyTextRewardTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  testimonyVideoRewardTokens?: number;

  @IsOptional()
  @IsBoolean()
  qualityGateEnabled?: boolean;

  // The four qualityWeight* fields must sum to 100 -- validated in
  // PlatformSettingsService.update, not expressible via per-field decorators
  // (mirrors the llmProviderOrder permutation check's pattern).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityWeightConsensus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityWeightNoise?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityWeightQuality?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityWeightLiveness?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityWeightAsrMatch?: number;

  @IsOptional()
  @IsBoolean()
  spellingNormalizationEnabled?: boolean;

  // Master kill switch for quality-gate-worker's optional emotion/prosody
  // analysis pass -- purely descriptive, never feeds compositeScore/payout.
  @IsOptional()
  @IsBoolean()
  speechExpressionEnabled?: boolean;

  // Same permutation constraint/validation shape as llmProviderOrder.
  @IsOptional()
  @IsString()
  @Matches(/^(openai|deepseek|anthropic),(openai|deepseek|anthropic),(openai|deepseek|anthropic)$/)
  spellingNormalizationProviderOrder?: string;

  @IsOptional()
  @IsBoolean()
  sentenceRebuildEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  phraseEscalationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  phraseTierGenerationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  phraseTierItemsPerTierPerRun?: number;

  @IsOptional()
  @IsBoolean()
  singleWordTrainingEnabled?: boolean;

  // Sender ID/name shown to recipients, overrides TERMII_SENDER_ID/
  // SMSLIVE247_SENDER_ID/AFRICASTALKING_SENDER_ID for every provider that
  // has one (Twilio has no equivalent). Empty string clears the override
  // back to each provider's own env var -- see PlatformSettingsService.update.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  smsSenderId?: string;

  // 3 comma-separated tokens from {termii,twilio,africastalking}; exact
  // permutation validated in PlatformSettingsService.update, same shape as
  // llmProviderOrder. smslive247 is not a fallback-chain member -- see
  // smslive247NativeOtpEnabled below.
  @IsOptional()
  @IsString()
  @Matches(
    /^(termii|twilio|africastalking),(termii|twilio|africastalking),(termii|twilio|africastalking)$/,
  )
  smsProviderOrder?: string;

  @IsOptional()
  @IsBoolean()
  smslive247NativeOtpEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsTransactionalOtpEnabled?: boolean;

  // 4 comma-separated tokens from {termii,twilio,africastalking,smslive247};
  // exact permutation validated in PlatformSettingsService.update. Separate
  // from smsProviderOrder -- smslive247 CAN send ordinary notification
  // text, only their OTP route rejects OTP-shaped messages.
  @IsOptional()
  @IsString()
  @Matches(
    /^(termii|twilio|africastalking|smslive247),(termii|twilio|africastalking|smslive247),(termii|twilio|africastalking|smslive247),(termii|twilio|africastalking|smslive247)$/,
  )
  smsTransactionalProviderOrder?: string;

  @IsOptional()
  @IsBoolean()
  p2pSmsTradeCreatedEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  p2pSmsPaymentMarkedEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  p2pSmsTokensReleasedEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  p2pSmsCancelledEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  cryptoWithdrawalsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  nowPaymentsPayoutsEnabled?: boolean;

  // Non-empty CSV subset of {USDT,USDC}; validated in PlatformSettingsService.update.
  @IsOptional()
  @IsString()
  allowedWithdrawalCurrencies?: string;

  // Non-empty CSV subset of {TRC20,ERC20,BEP20,SOL,POLYGON}; validated in PlatformSettingsService.update.
  @IsOptional()
  @IsString()
  allowedWithdrawalNetworks?: string;

  @IsOptional()
  @IsBoolean()
  isFlutterwaveFundingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isFlutterwavePayoutsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isFlutterwaveV4Enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isStripePayoutsEnabled?: boolean;

  // CSV of ISO 4217 currency codes; validated in PlatformSettingsService.update.
  @IsOptional()
  @IsString()
  allowedFlutterwaveCurrencies?: string;

  // CSV of ISO 3166-1 alpha-2 country codes; validated in PlatformSettingsService.update.
  @IsOptional()
  @IsString()
  allowedFlutterwaveCountries?: string;

  @IsOptional()
  @IsString()
  withdrawalFeeMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawalFeeTokenAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  withdrawalFeePercent?: number;

  @IsOptional()
  @IsBoolean()
  autoSubmitAfterApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isKycRequiredForWithdrawals?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  kycMinWithdrawalTokens?: number;

  @IsOptional()
  @IsBoolean()
  isKycRequiredOnboarding?: boolean;

  @IsOptional()
  @IsBoolean()
  kycAutoCancelStaleEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  kycAutoCancelStaleMinutes?: number;

  @IsOptional()
  @IsBoolean()
  authMaintenanceEnabled?: boolean;

  // ISO 8601 timestamp, or null to clear it (e.g. when switching maintenance
  // off). PlatformSettingsService.update requires this to be present and in
  // the future whenever authMaintenanceEnabled is being turned on. Sent as a
  // string over the wire, parsed to a Date in SettingsController before
  // reaching the service.
  @IsOptional()
  @IsISO8601()
  authMaintenanceUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  authMaintenanceMessage?: string;

  // Checklist of what the maintenance window blocks -- PlatformSettingsService.update
  // requires at least one of blockLogin/blockSignup/blockSessions to be true
  // whenever authMaintenanceEnabled is being turned on.
  @IsOptional()
  @IsBoolean()
  authMaintenanceBlockLogin?: boolean;

  @IsOptional()
  @IsBoolean()
  authMaintenanceBlockSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  authMaintenanceBlockSessions?: boolean;

  @IsOptional()
  @IsBoolean()
  authMaintenanceExcludeAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  authMaintenanceExcludePartner?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  registerRateLimitPerHour?: number;

  @IsOptional()
  @IsBoolean()
  landingShowCountries?: boolean;

  @IsOptional()
  @IsBoolean()
  landingShowDialects?: boolean;

  @IsOptional()
  @IsBoolean()
  landingShowTrainers?: boolean;

  @IsOptional()
  @IsBoolean()
  landingShowPoolVolume?: boolean;

  @IsOptional()
  @IsBoolean()
  landingShowPayout?: boolean;
}
