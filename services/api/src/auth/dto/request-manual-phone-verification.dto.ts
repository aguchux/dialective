import { IsString } from 'class-validator';

export class RequestManualPhoneVerificationDto {
  @IsString()
  phoneNumber!: string;
}
