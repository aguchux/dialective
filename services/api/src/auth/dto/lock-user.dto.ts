import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { UserStatus } from '@dialectiva/db';

export class LockUserDto {
  // Only SUSPENDED/BLOCKED are meaningful here -- reactivating back to
  // ACTIVE is not OTP-gated and stays on the existing admin/users/:id/status
  // route, matching the "locking is the dangerous direction" split.
  @IsEnum(UserStatus)
  status!: UserStatus;

  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}
