import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class RequestSubscriberPasswordResetDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}
