import { IsNumber, IsString, Length, Min } from 'class-validator';

export class RequestFlutterwaveDepositOtpDto {
  @IsNumber()
  @Min(1)
  usdAmount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}
