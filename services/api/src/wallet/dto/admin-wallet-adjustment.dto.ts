import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminWalletAdjustmentDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsNumber()
  @Min(-1_000_000_000)
  @Max(-0.00000001)
  tokenAmount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reference!: string;

  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}
