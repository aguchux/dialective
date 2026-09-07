import { IsString } from 'class-validator';

export class CloseAccountDto {
  @IsString()
  otpRequestId!: string;

  @IsString()
  code!: string;
}
