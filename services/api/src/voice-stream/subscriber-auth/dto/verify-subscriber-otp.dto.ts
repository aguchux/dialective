import { IsString, Length, Matches } from 'class-validator';

export class VerifySubscriberOtpDto {
  @IsString()
  ticket!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
