import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTrainingPayoutDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reference!: string;

  // Required only when PlatformSettings.adminPayoutOtpEnabled is on --
  // validated in the controller, not statically, since requiredness depends
  // on a runtime setting.
  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}
