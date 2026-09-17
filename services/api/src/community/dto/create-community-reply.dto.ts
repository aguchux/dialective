import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommunityAttachmentInputDto } from './community-attachment-input.dto';

export class CreateCommunityReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  parentReplyId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CommunityAttachmentInputDto)
  attachments?: CommunityAttachmentInputDto[];
}
