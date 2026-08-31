import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFaqDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(240)
  question!: string;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  answer!: string;
}
