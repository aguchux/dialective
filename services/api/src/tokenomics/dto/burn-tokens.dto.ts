import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class BurnTokensDto {
  @IsString()
  @MaxLength(80)
  accountCode!: string; // "treasury" or "user:<id>"

  @IsNumber()
  @Min(0.00000001)
  amount!: number;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
