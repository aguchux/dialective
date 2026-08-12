import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @Length(2, 2)
  code!: string; // ISO 3166-1 alpha-2

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode?: string; // ISO 4217, defaults to "USD" if omitted
}
