import { SystemUpdateKind } from '@dialectiva/db';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSystemUpdateDto {
  @IsEnum(SystemUpdateKind)
  kind!: SystemUpdateKind;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\/|https?:\/\/)/, { message: 'href must be an internal path or http(s) URL' })
  @MaxLength(500)
  href?: string;
}
