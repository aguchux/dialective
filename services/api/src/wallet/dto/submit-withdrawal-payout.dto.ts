import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class SubmitWithdrawalPayoutDto {
  // Required only when PlatformSettings.adminPayoutOtpEnabled is on.
  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;

  // Optional NOWPayments payout 2FA code. If omitted, the payout is created
  // and left PROCESSING/providerStatus=created_or_waiting_verification until
  // the provider is verified in dashboard or via the verify endpoint.
  @IsOptional()
  @IsString()
  @Length(4, 12)
  verificationCode?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
