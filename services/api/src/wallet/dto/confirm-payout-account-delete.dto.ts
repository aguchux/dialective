import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmPayoutAccountDeleteDto {
  @IsString()
  @IsNotEmpty()
  otpRequestId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}
