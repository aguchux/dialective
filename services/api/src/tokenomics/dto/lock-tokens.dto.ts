import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class LockTokensDto {
  @IsNumber()
  @Min(0.00000001)
  amount!: number;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
