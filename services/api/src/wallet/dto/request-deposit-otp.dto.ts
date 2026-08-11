import { IsIn, IsNumber, Min } from 'class-validator';
import { DEPOSIT_CURRENCIES, DepositCurrency } from './create-deposit.dto';

export class RequestDepositOtpDto {
  @IsIn(DEPOSIT_CURRENCIES)
  currency!: DepositCurrency;

  @IsNumber()
  @Min(1)
  usdAmount!: number;
}
