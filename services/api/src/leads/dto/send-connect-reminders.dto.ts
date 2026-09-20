import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendConnectRemindersDto {
  /** 'speakers' reaches approved speakers only, with their own topic in the body. */
  @IsString()
  @IsIn(['all', 'speakers'])
  audience!: 'all' | 'speakers';

  /** Optional note from the admin, shown above the standard event details. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
