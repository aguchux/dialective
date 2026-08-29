import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDialectDto {
  @IsString()
  tag!: string; // e.g. "ig", "yo-ng"

  @IsString()
  name!: string;

  @IsUUID()
  countryId!: string;

  @IsOptional()
  @IsString()
  keyboardLayout?: string;
}
