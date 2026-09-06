import { IsIn, IsOptional } from 'class-validator';
import { REPLY_SORTS, ReplySort } from '../replies/community-replies.service';

export class ListCommunityRepliesDto {
  @IsOptional()
  @IsIn(REPLY_SORTS)
  sort?: ReplySort;
}
