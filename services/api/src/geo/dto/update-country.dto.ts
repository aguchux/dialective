import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCountryDto {
  @IsOptional()
  @IsString()
  @Length(2, 2)
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
