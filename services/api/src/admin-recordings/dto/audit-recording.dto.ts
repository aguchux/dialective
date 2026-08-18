import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { AdminAuditStatus } from '@dialectiva/db';

export class AuditRecordingDto {
  @IsEnum(AdminAuditStatus)
  status!: AdminAuditStatus;

  // Only meaningful alongside status: INVALID -- ignored otherwise. Debits
  // the trainer's wallet for this recording's payoutTokenAmount when true
  // and the recording was already settled; a no-op (not an error) if it
  // wasn't paid out yet, since there's nothing to claw back.
  @IsOptional()
  @IsBoolean()
  clawback?: boolean;

  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}
