import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class RequestWithdrawalOtpDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;
}
