import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateFaqDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(240)
  question?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  answer?: string;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}
