import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateSystemUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message?: string;

  // Empty string clears the link; omit the field entirely to leave it unchanged.
  @IsOptional()
  @IsString()
  @Matches(/^(\/|https?:\/\/)?$/, { message: 'href must be an internal path or http(s) URL' })
  @MaxLength(500)
  href?: string;
}
