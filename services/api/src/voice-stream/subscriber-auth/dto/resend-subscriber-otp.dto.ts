import { IsString } from 'class-validator';

export class ResendSubscriberOtpDto {
  @IsString()
  ticket!: string;
}
