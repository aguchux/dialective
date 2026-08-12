import { IsString } from 'class-validator';

export class RequestPhoneOtpDto {
  @IsString()
  phoneNumber!: string; // E.164, e.g. "+2348012345678" -- re-validated server-side via isValidPhoneNumber
}
