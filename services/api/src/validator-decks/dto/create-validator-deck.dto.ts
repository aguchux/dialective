import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateValidatorDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsUUID()
  countryId!: string;

  @IsUUID()
  dialectId!: string;

  @IsOptional()
  @IsUUID()
  dialectVariantId?: string;
}
