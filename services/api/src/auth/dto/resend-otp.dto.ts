import { IsString } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  ticket!: string;
}
