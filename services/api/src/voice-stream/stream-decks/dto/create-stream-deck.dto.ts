import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStreamDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsOptional()
  @IsString()
  subdialectTag?: string;
}
