import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ALL_SMS_PROVIDER_KEYS, SmsProviderKey } from '../sms-provider.interface';

export class CreateAdminSmsDto {
  @IsUUID()
  recipientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(480)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;

  /** Forces a single provider with no fallback when set; omitted uses the admin-configured smsTransactionalProviderOrder chain (see SmsService.sendTransactional). */
  @IsOptional()
  @IsIn(ALL_SMS_PROVIDER_KEYS)
  provider?: SmsProviderKey;
}
