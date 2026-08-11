import { IsBoolean, IsEmail, IsInt, IsOptional, IsPositive, Min } from 'class-validator';

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
  wordStuckTimeoutHours?: number;
}
