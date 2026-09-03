import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAdminSmsDto {
  @IsUUID()
  recipientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(480)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;
}
