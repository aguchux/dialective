import { IsIn, IsOptional, IsString } from 'class-validator';

export const WITHDRAWAL_OUTCOMES = ['paid', 'rejected'] as const;
export type WithdrawalOutcome = (typeof WITHDRAWAL_OUTCOMES)[number];

export class ResolveWithdrawalDto {
  @IsIn(WITHDRAWAL_OUTCOMES)
  outcome!: WithdrawalOutcome;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
