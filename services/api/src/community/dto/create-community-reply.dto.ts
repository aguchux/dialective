import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommunityReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  parentReplyId?: string;
}
