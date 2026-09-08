import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateValidatorDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;
}
