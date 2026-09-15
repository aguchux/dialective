import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RequestWhatsAppValidationDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}

export class VerifyWhatsAppValidationDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
