import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';

export class LoginSubscriberDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
