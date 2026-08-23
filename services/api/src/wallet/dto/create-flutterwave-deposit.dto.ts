import { IsNumber, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export class CreateFlutterwaveDepositDto {
  @IsNumber()
  @Min(1)
  usdAmount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string; // ISO 4217, e.g. "NGN" -- the currency Flutterwave charges the user in

  @IsString()
  @Length(2, 2)
  country!: string; // ISO 3166-1 alpha-2, used to look up Country.usdExchangeRate for the USD->currency conversion

  @IsUUID()
  otpRequestId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
