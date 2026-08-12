import { IsBoolean, IsEmail, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, Min } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsPositive()
  tokenUsdRate?: number;

  @IsOptional()
  @IsPositive()
  minWithdrawalTokens?: number;

  @IsOptional()
  @IsEmail()
  resendFromAddress?: string;

  @IsOptional()
  @IsEmail()
  leadsNotificationAddress?: string;

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
  adminPayoutOtpEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  wordStuckTimeoutMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  scoringSlaMinutes?: number;

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
  @Max(5)
  llmWordsPerItem?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  llmItemsPerRun?: number;
}
