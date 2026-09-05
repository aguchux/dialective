import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCommunityProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  dialects?: string[];
}
