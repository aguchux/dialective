import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommunityPostDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  spaceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  tags?: string[];
}
