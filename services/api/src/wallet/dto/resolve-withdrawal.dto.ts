import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export const WITHDRAWAL_OUTCOMES = ['paid', 'rejected'] as const;
export type WithdrawalOutcome = (typeof WITHDRAWAL_OUTCOMES)[number];

export class ResolveWithdrawalDto {
  @IsIn(WITHDRAWAL_OUTCOMES)
  outcome!: WithdrawalOutcome;

  @IsOptional()
  @IsString()
  adminNote?: string;

  // Required only when PlatformSettings.adminPayoutOtpEnabled is on, and
  // only for outcome='paid' (rejecting doesn't move money) -- validated in
  // the controller.
  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}
