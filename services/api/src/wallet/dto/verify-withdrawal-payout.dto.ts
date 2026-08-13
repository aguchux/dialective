import { IsString, Length } from 'class-validator';

export class VerifyWithdrawalPayoutDto {
  @IsString()
  @Length(4, 12)
  verificationCode!: string;
}
