import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGithubIssueDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60_000)
  body?: string;
}
