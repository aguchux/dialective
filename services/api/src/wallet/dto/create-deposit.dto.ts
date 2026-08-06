import { IsIn, IsNumber, Min } from 'class-validator';

export const DEPOSIT_CURRENCIES = ['USDC', 'USDT'] as const;
export type DepositCurrency = (typeof DEPOSIT_CURRENCIES)[number];

export class CreateDepositDto {
  @IsIn(DEPOSIT_CURRENCIES)
  currency!: DepositCurrency;

  @IsNumber()
  @Min(1)
  usdAmount!: number;
}
