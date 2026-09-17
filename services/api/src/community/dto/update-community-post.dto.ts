import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CREATABLE_COMMUNITY_POST_STATUSES,
  CreatableCommunityPostStatus,
} from './create-community-post.dto';
import { CommunityAttachmentInputDto } from './community-attachment-input.dto';

export class UpdateCommunityPostDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  tags?: string[];

  /** Only a DRAFT -> PUBLISHED transition is allowed here -- see CommunityPostsService.update. */
  @IsOptional()
  @IsIn(CREATABLE_COMMUNITY_POST_STATUSES)
  status?: CreatableCommunityPostStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CommunityAttachmentInputDto)
  attachments?: CommunityAttachmentInputDto[];
}
