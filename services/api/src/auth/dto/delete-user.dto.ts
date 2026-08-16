import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class DeleteUserDto {
  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}
