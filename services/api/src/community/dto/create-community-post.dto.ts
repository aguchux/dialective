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
import { CommunityAttachmentInputDto } from './community-attachment-input.dto';

export const CREATABLE_COMMUNITY_POST_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type CreatableCommunityPostStatus = (typeof CREATABLE_COMMUNITY_POST_STATUSES)[number];

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

  /** Defaults to PUBLISHED (matching the schema default) when omitted. */
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
