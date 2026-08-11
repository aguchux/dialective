import { IsNotEmpty, IsNumber, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsUUID()
  otpRequestId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
