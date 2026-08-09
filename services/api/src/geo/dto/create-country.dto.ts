import { IsString, Length } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @Length(2, 2)
  code!: string; // ISO 3166-1 alpha-2

  @IsString()
  name!: string;
}
