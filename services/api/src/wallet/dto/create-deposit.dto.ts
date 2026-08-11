import { IsIn, IsNumber, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export const DEPOSIT_CURRENCIES = ['USDC', 'USDT'] as const;
export type DepositCurrency = (typeof DEPOSIT_CURRENCIES)[number];

export class CreateDepositDto {
  @IsIn(DEPOSIT_CURRENCIES)
  currency!: DepositCurrency;

  @IsNumber()
  @Min(1)
  usdAmount!: number;

  @IsUUID()
  otpRequestId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
