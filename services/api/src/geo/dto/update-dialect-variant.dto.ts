import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDialectVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
