import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RequestWhatsAppValidationDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}

export class VerifyWhatsAppValidationDto {
  @IsString()
  @Length(6, 6)
  // Case-insensitive at the transport layer -- WhatsAppValidatorService.verify
  // normalizes to uppercase before hashing (see whatsapp-code.util.ts).
  @Matches(/^[A-Za-z0-9]{6}$/)
  code!: string;
}
