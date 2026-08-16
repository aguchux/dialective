import { IsString, MaxLength } from 'class-validator';

export class CreateDialectVariantDto {
  @IsString()
  @MaxLength(60)
  tag!: string; // e.g. "izzi", "ezza"

  @IsString()
  @MaxLength(120)
  name!: string; // e.g. "Izzi"
}
