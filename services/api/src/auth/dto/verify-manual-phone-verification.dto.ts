import { IsString, Matches } from 'class-validator';

export class VerifyManualPhoneVerificationDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
